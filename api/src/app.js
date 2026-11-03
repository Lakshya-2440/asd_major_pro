import express from 'express';
import { requestLogger } from './middlewares';
import { errorHandler } from './middlewares/errorHandler.js';

export function buildApp() {
    const app = express()

    app.use(express.json())
    app.use(requestLogger)


    app.get('/api/v1/test-error', (req, res, next)=> {
        throw new Error('Temporary test error')
    })

    app.use((req,res)=>{
        res.status(404).json({
            status: 'error',
            message: 'Route not found'
        })
    })

    app.use(errorHandler);

    return app
}


