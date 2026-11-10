import { Router } from 'express';
import { createAnimal, getAnimal, listAnimals } from '../controllers/animals.controller';
import { authenticateToken } from '../middlewares/auth.middleware';

const animalsRouter = Router();

animalsRouter.use(authenticateToken);
animalsRouter.post('/', createAnimal);
animalsRouter.get('/', listAnimals);
animalsRouter.get('/:id', getAnimal);

export default animalsRouter;
