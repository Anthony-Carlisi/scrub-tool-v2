const nodemailer = require('nodemailer')

async function sendNotifications(to, subject, body, attachements) {
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

module.exports = {
  sendNotifications,
}
