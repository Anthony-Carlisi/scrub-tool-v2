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

const apiKey = config.get('airtableApiKey')
const baseId = config.get('airtableBase')
const base = new Airtable({ apiKey: apiKey }).base(baseId)

const uploadFile = multer({ storage: storage })

// @route   Post api/upload
// @desc    Create an Upload
// @access  Private
router.post('/', uploadFile.single('file'), async (req, res) => {
  try {
    let match
    let headerFields = []
    //Gets
    let csvData = await csv()
      .fromFile(req.file.path)
      .on('header', (headers) => {
        headerFields = headers
        match = headers.find((element) => {
          if (element.includes('phone')) {
            return true
          }
        })
      })
    if (match === undefined)
      return res.status(503).json({ msg: 'Phone Number Field not found' })

    fs.unlink(req.file.path, (err) => {
      if (err) {
        console.error(err)
        return
      }
    })

    const airtableSearch = async (table, filterFormula) => {
      try {
        const records = await base(table)
          .select({
            //Change filter params
            filterByFormula: filterFormula,
          })
          .all()
        return records
      } catch (error) {
        console.log(error)
      }
    }

    let dupParams = await airtableSearch(
      'Merchant Records',
      `DATETIME_DIFF({Status Change Date (DUPS)}, DATEADD(TODAY(),-90,'days'), 'days') > 0`
    )
    let dupParamsInbound = await airtableSearch(
      'Inbound Leads',
      `DATETIME_DIFF({Status Change}, DATEADD(TODAY(),-90,'days'), 'days') > 0`
    )
    let arr = csvData
    let dupBlockLeads = []

    arr.map((csvData, index) => {
      for (let j = 0; j < dupParams.length; j++) {
        if (
          dupParams[j].fields['Business Phone'] === csvData[match] ||
          dupParams[j].fields['Owner 1 Mobile'] === csvData[match]
        ) {
          arr.splice(index, 1)
          let obj = csvData
          obj['Dup Blocked MID'] = dupParams[j].fields.MID
          dupBlockLeads.push(obj)
        }
      }
    })

    arr.map((csvData, index) => {
      for (let j = 0; j < dupParamsInbound.length; j++) {
        if (
          dupParamsInbound[j].fields['Business Phone Formatted'] ===
            csvData[match] ||
          dupParamsInbound[j].fields['Mobile Phone Formatted'] ===
            csvData[match]
        ) {
          arr.splice(index, 1)
          let obj = csvData
          obj['Dup Blocked MID'] = dupParamsInbound[j].ID
          dupBlockLeads.push(obj)
        }
      }
    })

    let attachments = []

    if (arr.length !== 0) {
      const csv = json2csv(arr, headerFields)

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
    if (dupBlockLeads.length !== 0) {
      headerFields.push('Dup Blocked MID')
      const csv2 = json2csv(dupBlockLeads, headerFields)
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
      'marketing@straightlinesource.com.com',
      `${req.file.originalname} Scrub ${Date.now}`,
      'Test body',
      attachments
    ).then(() => {
      if (arr.length !== 0) {
        fs.unlink(`./temp/${req.file.originalname} Export.csv`, (err) => {
          if (err) {
            console.error(err)
            return
          }
        })
      }
      if (dupBlockLeads.length !== 0) {
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
