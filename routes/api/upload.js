const express = require('express')
const router = express.Router()
const csv = require('csvtojson')
const fs = require('fs')
const Airtable = require('airtable')
const config = require('config')
const json2csv = require('json2csv').parse
const multer = require('multer')
const nodemailer = require('nodemailer')

var storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'temp/')
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname)
  },
})

const base = new Airtable({ apiKey: config.get('airtableApiKey') }).base(
  config.get('airtableBase')
)
const uploadFile = multer({ storage: storage })

const airtableSearch = async (table, scrubbingView) => {
  try {
    const records = await base(table)
      .select({
        //Change filter params
        //filterByFormula: filterFormula,
        view: scrubbingView,
      })
      .all()
    return records
  } catch (error) {
    console.log(error)
  }
}

// @route   Post api/upload
// @desc    Create an Upload
// @access  Private
router.post('/', uploadFile.single('file'), async (req, res) => {
  try {
    let phoneHeader
    let emailHeader
    let headerFields = []
    //Gets
    const csvData = await csv()
      .fromFile(req.file.path)
      .on('header', (headers) => {
        headerFields = headers
        phoneHeader = headers.find((element) => {
          if (element.includes('phone')) {
            return true
          }
        })
        emailHeader = headers.find((element) => {
          if (element.includes('email')) {
            return true
          }
        })
      })

    if (phoneHeader === undefined || emailHeader === undefined)
      return res
        .status(503)
        .json({ msg: 'Phone Number or Email Field not found' })

    fs.unlink(req.file.path, (err) => {
      if (err) {
        console.error(err)
        return
      }
    })

    let dupParams = await airtableSearch('Merchant Records', 'Scrubbing Tool')
    let dupParamsInbound = await airtableSearch(
      'Inbound Leads',
      'Scrubbing Tool'
    )

    const result = []
    const dups = []
    const map = new Map()
    for (const item of dupParamsInbound) {
      if (
        !map.has(item.fields['Mobile Phone Formatted']) ||
        !map.has(item.fields['Business Phone Formatted']) ||
        !map.has(item.fields.Email)
      ) {
        map.set(item.fields['Mobile Phone Formatted'], true)
        map.set(item.fields['Business Phone Formatted'], true)
        map.set(item.fields.Email, true)
      }
    }
    for (const item of dupParams) {
      if (
        !map.has(item.fields['Business Phone Text']) ||
        !map.has(item.fields['Owner 1 Mobile Text']) ||
        !map.has(item.fields['Email 1'])
      ) {
        map.set(item.fields['Business Phone Text'], true)
        map.set(item.fields['Owner 1 Mobile Text'], true)
        map.set(item.fields['Email 1'], true)
      }
    }

    for (const item of csvData) {
      if (!map.has(item[phoneHeader] || !map.has(item[emailHeader]))) {
        result.push(item)
      } else {
        dups.push(item)
      }
    }

    let attachments = []

    if (result.length !== 0) {
      const csv = json2csv(result, headerFields)

      fs.writeFile(
        `./temp/${req.file.originalname} Export.csv`,
        csv,
        function (err) {
          if (err) throw err
          console.log('file saved')
        }
      )
      attachments.push({
        filename: `${req.file.originalname} Export.csv`,
        path: `./temp/${req.file.originalname} Export.csv`,
      })
    }
    if (dups.length !== 0) {
      headerFields.push('Dup Blocked MID')
      const csv2 = json2csv(dups, headerFields)
      fs.writeFile(
        `./temp/${req.file.originalname} DupBlock Export.csv`,
        csv2,
        function (err) {
          if (err) throw err
          console.log('file saved')
        }
      )
      attachments.push({
        filename: `${req.file.originalname} DupBlock Export.csv`,
        path: `./temp/${req.file.originalname} DupBlock Export.csv`,
      })
    }

    async function sendNotifications(to, subject, body, attachments) {
      // create reusable transporter object using the default SMTP transport
      let transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: 'business@straightlinesource.com', // generated ethereal user
          pass: 'yjlrfxqyvrsgbfyt', // generated ethereal password
        },
        tls: {
          rejectUnauthorized: false,
        },
      })
      // send mail with CSV ATTACHMENT with defined transport object
      let info = await transporter.sendMail({
        from: '"Notifications" <business@straightlinesource.com>', // sender address
        to: to, // list of receivers
        subject: subject, // Subject line
        text: body, // html body
        attachments: attachments,
      })
      console.log('Message sent: %s', info.messageId) // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>
    }

    // Change Email info
    sendNotifications(
      'anthonycarlisi95@gmail.com',
      `${req.file.originalname} Scrub ${Date.now}`,
      'Test body',
      attachments
    ).then(() => {
      if (result.length !== 0) {
        fs.unlink(`./temp/${req.file.originalname} Export.csv`, (err) => {
          if (err) {
            console.error(err)
            return
          }
        })
      }
      if (dups.length !== 0) {
        fs.unlink(
          `./temp/${req.file.originalname} DupBlock Export.csv`,
          (err) => {
            if (err) {
              console.error(err)
              return
            }
          }
        )
      }
    })

    res.json(`Scrub Completed...`)
  } catch (err) {
    console.error(err.message)
    res.status(500).send('Server Error')
  }
})

module.exports = router
