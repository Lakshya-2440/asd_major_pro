import express from 'express';

export function buildApp() {
    const app = express()

    app.use(express.json())
    return app
}