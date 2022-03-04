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
  config.get('scrubbingBase')
)
const uploadFile = multer({ storage: storage })

const airtableSearch = async (table) => {
  try {
    const records = await base(table).select().all()
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
    let sendToEmail = req.body.sendToEmail
    console.log(sendToEmail)
    let emailHeader //name of header field (just has to include the word 'email')
    let headerFields = []

    //CSV to JSON
    const csvData = await csv()
      .fromFile(req.file.path)
      .on('header', (headers) => {
        //check if header contains
        emailHeader = headers.find((element) => {
          if (element.includes('email')) {
            return true
          }
        })

        console.log('emailHeader: ' + emailHeader)
      })

    //if no email field found
    if (emailHeader === undefined)
      return res.status(503).json({ msg: "'email' field not found" })

    fs.unlink(req.file.path, (err) => {
      if (err) {
        console.error(err)
        return
      }
    })

    //records to block by
    let badTokens = await airtableSearch('Bad Tokens')

    let results = []
    let clean = []
    let dirty = []
    let tokensMap = new Map() //badTokens results into  map

    //adds badTokens records to map with token name as key
    for (let token of badTokens) {
      if (!tokensMap.has(token.fields['token'])) {
        tokensMap.set(token.fields['token'])
      }
    }

    //if in tokensMap, add to dirty records else add it to clean
    for (let item of csvData) {
      let email = item[emailHeader]
      let username = email.split('@')[0] //username to scrub against
      if (tokensMap.has(username)) {
        dirty.push(item)
        item.email = '' //clear email from csv item
        results.push(item)
      } else {
        clean.push(item)
        results.push(item)
      }
    }

    let attachments = []

    //if there are results records add to attachments
    if (clean.length !== 0) {
      let csv = json2csv(results, headerFields)
      fs.writeFile(
        `./temp/${req.file.originalname} - RESULTS.csv`,
        csv,
        function (err) {
          if (err) throw err
          console.log('results file saved')
        }
      )
      attachments.push({
        filename: `${req.file.originalname} - RESULTS.csv`,
        path: `./temp/${req.file.originalname} - RESULTS.csv`,
      })
    }

    //if there are clean records add to attachments
    if (clean.length !== 0) {
      let csv = json2csv(clean, headerFields)
      fs.writeFile(
        `./temp/${req.file.originalname} - CLEAN.csv`,
        csv,
        function (err) {
          if (err) throw err
          console.log('clean file saved')
        }
      )
      attachments.push({
        filename: `${req.file.originalname} - CLEAN.csv`,
        path: `./temp/${req.file.originalname} - CLEAN.csv`,
      })
    }

    //if there are dirty records add to attachments
    if (dirty.length !== 0) {
      let csv2 = json2csv(dirty, headerFields)
      fs.writeFile(
        `./temp/${req.file.originalname} - DIRTY.csv`,
        csv2,
        function (err) {
          if (err) throw err
          console.log('dirty file saved')
        }
      )
      attachments.push({
        filename: `${req.file.originalname} - DIRTY.csv`,
        path: `./temp/${req.file.originalname} - DIRTY.csv`,
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
      sendToEmail,
      `TOKEN SCRUB: ${req.file.originalname} - ${new Date().toLocaleString()}`,
      'Token Scrub Results',
      attachments
    ).then(() => {
      if (results.length !== 0) {
        fs.unlink(
          `./temp/${req.file.originalname} - RESULTS.csv`,
          (err) => {
            if (err) {
              console.error(err)
              return
            }
          }
        )
      }
      if (clean.length !== 0) {
        fs.unlink(`./temp/${req.file.originalname} - CLEAN.csv`, (err) => {
          if (err) {
            console.error(err)
            return
          }
        })
      }
      if (dirty.length !== 0) {
        fs.unlink(`./temp/${req.file.originalname} - DIRTY.csv`, (err) => {
          if (err) {
            console.error(err)
            return
          }
        })
      }
    })

    res.json(`Token Scrub Completed...`)
  } catch (err) {
    console.error(err.message)
    res.status(500).send('Server Error')
  }
})

module.exports = router
