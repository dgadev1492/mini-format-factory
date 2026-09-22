import express from 'express'
import dotenv from 'dotenv'
dotenv.config()
import Routes from "./src/routes/Routes.js"

const app = express()
const PORT = process.env.PORT || 3000

//Middlewares
app.use(express.json())
app.use(express.urlencoded({extended:true}))
app.use(express.static('public'))
app.use(Routes)

//Same settings
app.set('views','views')
app.set('view engine','ejs')

//Runnig server
app.listen(PORT,"0.0.0.0",()=>{
console.log(`Server On http://localhost:${PORT}`)
})
