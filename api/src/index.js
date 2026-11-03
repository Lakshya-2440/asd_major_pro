import {buildApp} from './app.js';

const app = buildApp();
const port = Number(process.env.PORT) || 3000;

app.listen(port, ()=>{
    console.log(`Server is running on port ${port}`)
});3