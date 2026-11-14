import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import axios from 'axios'
import { CircleAlert, LoaderCircle, Save, X } from 'lucide-react'
import { createAnimal, normalizeTag } from '../services/animals'
import { BREEDS_BY_SPECIES, SPECIES_LABELS, type Animal, type Species } from '../types/animal'

interface Props {
  initialTag?: string
  onClose: () => void
  onCreated: (animal: Animal) => void
}

interface Values {
  tag_id: string
  species: string
  breed: string
  owner_name: string
  village: string
}

type Errors = Partial<Record<keyof Values, string>>

function validate(values: Values): Errors {
  const errors: Errors = {}
  const tag = normalizeTag(values.tag_id)
  if (!tag) errors.tag_id = 'Tag ID is required.'
  else if (!/^[A-Za-z0-9-]+$/.test(tag)) errors.tag_id = 'Use letters, numbers and hyphens only.'
  if (!values.species) errors.species = 'Select a species.'
  if (!values.breed) errors.breed = 'Select a breed.'
  return errors
}

interface FieldProps {
  id: string
  label: string
  required?: boolean
  error?: string
  children: ReactNode
}

function Field({ id, label, required, error, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block font-bold">
        {label}
        {required && <span aria-hidden="true" className="text-red-700"> *</span>}
      </label>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1 font-semibold text-red-800">
          {error}
        </p>
      )}
    </div>
  )
}

export default function AnimalFormModal({ initialTag = '', onClose, onCreated }: Props) {
  const [values, setValues] = useState<Values>({
    tag_id: initialTag,
    species: '',
    breed: '',
    owner_name: '',
    village: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  function update(field: keyof Values, value: string) {
    // Changing species invalidates the chosen breed
    setValues((v) => ({ ...v, [field]: value, ...(field === 'species' ? { breed: '' } : {}) }))
    setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSubmitting(true)
    setFormError('')
    try {
      const animal = await createAnimal({
        tag_id: normalizeTag(values.tag_id),
        species: values.species as Species,
        breed: values.breed,
        owner_name: values.owner_name.trim(),
        village: values.village.trim(),
      })
      onCreated(animal)
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setErrors({ tag_id: 'This Tag ID is already registered. Search for it instead.' })
      } else if (axios.isAxiosError(err) && !err.response) {
        setFormError('Cannot reach the server. Check your internet connection.')
      } else {
        setFormError('Could not save the animal. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const breeds = BREEDS_BY_SPECIES[values.species as Species] ?? []

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-black/70">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="animal-form-title"
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 pb-8"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="animal-form-title" className="text-2xl font-extrabold">
            Register New Animal
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" className="btn-secondary px-0">
            <X aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl border-2 border-red-700 bg-red-50 p-4 font-semibold text-red-900"
            >
              <CircleAlert className="shrink-0" aria-hidden="true" />
              <span>{formError}</span>
            </div>
          )}

          <Field id="tag_id" label="Tag ID" required error={errors.tag_id}>
            <input
              id="tag_id"
              autoFocus={!initialTag}
              autoComplete="off"
              spellCheck={false}
              value={values.tag_id}
              onChange={(e) => update('tag_id', e.target.value)}
              aria-invalid={!!errors.tag_id}
              aria-describedby={errors.tag_id ? 'tag_id-error' : undefined}
              className="field-input text-xl font-bold"
            />
          </Field>

          <Field id="species" label="Species" required error={errors.species}>
            <select
              id="species"
              value={values.species}
              onChange={(e) => update('species', e.target.value)}
              aria-invalid={!!errors.species}
              aria-describedby={errors.species ? 'species-error' : undefined}
              className="field-input"
            >
              <option value="">Select species</option>
              {Object.entries(SPECIES_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>

          <Field id="breed" label="Breed" required error={errors.breed}>
            <select
              id="breed"
              value={values.breed}
              disabled={!values.species}
              onChange={(e) => update('breed', e.target.value)}
              aria-invalid={!!errors.breed}
              aria-describedby={errors.breed ? 'breed-error' : undefined}
              className="field-input"
            >
              <option value="">Select breed</option>
              {breeds.map((breed) => (
                <option key={breed} value={breed}>
                  {breed}
                </option>
              ))}
            </select>
          </Field>

          <Field id="owner_name" label="Owner Name">
            <input
              id="owner_name"
              autoComplete="off"
              value={values.owner_name}
              onChange={(e) => update('owner_name', e.target.value)}
              className="field-input"
            />
          </Field>

          <Field id="village" label="Village">
            <input
              id="village"
              autoComplete="off"
              value={values.village}
              onChange={(e) => update('village', e.target.value)}
              className="field-input"
            />
          </Field>

          <button type="submit" disabled={submitting} className="btn-primary w-full disabled:opacity-70">
            {submitting ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />
                Saving…
              </>
            ) : (
              <>
                <Save aria-hidden="true" />
                Save &amp; Start Evaluation
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}