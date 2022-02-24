// Dependency for express to receive json
const express = require('express')
const app = express()

// Init Middleware allows json to be interpreted
app.use(express.json({ extended: false }))

app.use('/api/upload', require('./routes/api/upload'))

// bind port to process.env file, if not present then port defaults to 5000
const PORT = process.env.PORT || 5000
// when the server is started it will console log Server started on port (then the port specified)
app.listen(PORT, () => console.log(`Server started on port ${PORT}`))

//erick test
