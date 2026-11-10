import type { Request, Response } from 'express';
import { z } from 'zod';
import { getAnimalsService } from '../services/animals.service';

const createAnimalSchema = z.object({
  tag_id: z.string().trim().min(1).max(100),
  species: z.enum(['cattle', 'buffalo']),
  breed: z.string().trim().min(1).max(100),
  owner_name: z.string().trim().min(1).max(200),
  village: z.string().trim().min(1).max(200),
}).strict();

const animalIdSchema = z.string().uuid();

export async function createAnimal(req: Request, res: Response): Promise<void> {
  const parsed = createAnimalSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid animal details', details: parsed.error.flatten().fieldErrors });
    return;
  }
  try {
    const animal = await getAnimalsService().create(parsed.data);
    res.status(201).json(animal);
  } catch (error) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: 'An animal with this tag_id already exists' });
      return;
    }
    if (isInvalidDatabaseEnum(error)) {
      res.status(400).json({ error: 'Invalid species' });
      return;
    }
    console.error('Animal creation failed', error);
    res.status(503).json({ error: 'Unable to create animal at this time' });
  }
}

export async function listAnimals(req: Request, res: Response): Promise<void> {
  const tag = req.query.tag;
  if (tag !== undefined && (typeof tag !== 'string' || tag.trim().length > 100)) {
    res.status(400).json({ error: 'tag must be a string of at most 100 characters' });
    return;
  }
  try {
    const animals = await getAnimalsService().list(tag as string | undefined);
    res.json({ data: animals });
  } catch (error) {
    console.error('Animal search failed', error);
    res.status(503).json({ error: 'Unable to search animals at this time' });
  }
}

export async function getAnimal(req: Request, res: Response): Promise<void> {
  const parsedId = animalIdSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(400).json({ error: 'Invalid animal id' });
    return;
  }
  try {
    const animal = await getAnimalsService().getById(parsedId.data);
    if (!animal) {
      res.status(404).json({ error: 'Animal not found' });
      return;
    }
    res.json(animal);
  } catch (error) {
    console.error('Animal lookup failed', error);
    res.status(503).json({ error: 'Unable to retrieve animal at this time' });
  }
}

function isUniqueViolation(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '23505';
}

function isInvalidDatabaseEnum(error: unknown): error is { code: string } {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === '22P02';
}
