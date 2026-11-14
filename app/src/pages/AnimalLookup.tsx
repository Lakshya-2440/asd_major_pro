import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { ArrowRight, CircleAlert, LoaderCircle, Plus, Search, SearchX } from 'lucide-react'
import AnimalFormModal from '../components/AnimalFormModal'
import { useDebouncedValue } from '../hooks/useDebouncedValue'
import { normalizeTag, searchAnimals } from '../services/animals'
import { SPECIES_LABELS, type Animal } from '../types/animal'

// animals === null means the request failed
type SearchResult = { tag: string; animals: Animal[] | null }

const captureUrl = (id: Animal['id']) =>
  `/evaluations/capture?animalId=${encodeURIComponent(String(id))}`

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-sm font-bold text-slate-700">{label}</dt>
      <dd className="text-lg font-semibold">{value || '—'}</dd>
    </div>
  )
}

function AnimalCard({ animal }: { animal: Animal }) {
  const count = animal.evaluation_count

  return (
    <li>
      <Link
        to={captureUrl(animal.id)}
        className="block rounded-2xl border-2 border-slate-900 bg-white p-4 shadow-sm active:bg-brand-50"
      >
        <p className="text-sm font-bold uppercase tracking-wide text-slate-700">Tag ID</p>
        <p className="text-2xl font-extrabold">{animal.tag_id}</p>

        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
          <Detail label="Species" value={SPECIES_LABELS[animal.species] ?? animal.species} />
          <Detail label="Breed" value={animal.breed} />
          <Detail label="Village" value={animal.village} />
          <Detail label="Owner" value={animal.owner_name} />
        </dl>

        {count ? (
          <p className="mt-2 text-slate-700">
            {count} previous {count === 1 ? 'evaluation' : 'evaluations'}
          </p>
        ) : null}

        <span className="mt-4 flex min-h-[56px] items-center justify-center gap-2 rounded-xl bg-brand-700 text-lg font-bold text-white">
          Start Evaluation
          <ArrowRight aria-hidden="true" />
        </span>
      </Link>
    </li>
  )
}

export default function AnimalLookup({ debounceMs = 400 }: { debounceMs?: number }) {
  const navigate = useNavigate()
  const [tag, setTag] = useState('')
  const [result, setResult] = useState<SearchResult | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [showForm, setShowForm] = useState(false)

  const query = normalizeTag(tag)
  const debouncedQuery = useDebouncedValue(query, debounceMs)

  useEffect(() => {
    if (!debouncedQuery) return
    const controller = new AbortController()

    searchAnimals(debouncedQuery, controller.signal)
      .then((animals) => setResult({ tag: debouncedQuery, animals }))
      .catch((err) => {
        if (!axios.isCancel(err)) setResult({ tag: debouncedQuery, animals: null })
      })

    // Cancel the request if the user keeps typing, so old results can't overwrite new ones
    return () => controller.abort()
  }, [debouncedQuery, attempt])

  // Status is derived from what's typed vs what we last fetched, so there is no
  // "loading" state to keep in sync by hand
  const current = result && result.tag === query ? result : null
  const status = !query ? 'idle' : !current ? 'loading' : current.animals === null ? 'error' : 'done'
  const animals = current?.animals ?? []
  const notFound = status === 'done' && animals.length === 0

  function retry() {
    setResult(null)
    setAttempt((n) => n + 1)
  }

  return (
    <section className="p-4">
      <h1 className="text-2xl font-extrabold">Find Animal</h1>
      <p className="mt-1 text-slate-700">Enter the ear tag ID to start a new evaluation.</p>

      <label htmlFor="tag-search" className="sr-only">
        Animal Tag ID
      </label>
      <div className="relative mt-4">
        <Search
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-700"
          aria-hidden="true"
        />
        <input
          id="tag-search"
          type="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          placeholder="Tag ID"
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          className="field-input min-h-[64px] pl-14 text-2xl font-bold"
        />
      </div>

      <div className="mt-6" aria-live="polite">
        {status === 'idle' && (
          <p className="text-center text-slate-700">Type a Tag ID above to look up an animal.</p>
        )}

        {status === 'loading' && (
          <p className="flex items-center justify-center gap-2 text-lg font-bold">
            <LoaderCircle className="animate-spin" aria-hidden="true" />
            Searching…
          </p>
        )}

        {status === 'error' && (
          <div role="alert" className="rounded-xl border-2 border-red-700 bg-red-50 p-4 text-red-900">
            <p className="flex items-start gap-2 font-semibold">
              <CircleAlert className="shrink-0" aria-hidden="true" />
              Could not search. Check your connection and try again.
            </p>
            <button type="button" onClick={retry} className="btn-secondary mt-3 w-full">
              Try again
            </button>
          </div>
        )}

        {status === 'done' && animals.length > 0 && (
          <ul className="space-y-4">
            {animals.map((animal) => (
              <AnimalCard key={animal.id} animal={animal} />
            ))}
          </ul>
        )}

        {notFound && (
          <div className="rounded-2xl border-2 border-dashed border-slate-900 p-6 text-center">
            <SearchX className="mx-auto" size={40} aria-hidden="true" />
            <p className="mt-3 text-xl font-extrabold">No animal found</p>
            <p className="mt-1 text-slate-700">Nothing is registered with Tag ID {query}.</p>
            <button type="button" onClick={() => setShowForm(true)} className="btn-primary mt-4 w-full">
              <Plus aria-hidden="true" />
              Register New Animal
            </button>
          </div>
        )}
      </div>

      {!notFound && (
        <button type="button" onClick={() => setShowForm(true)} className="btn-secondary mt-6 w-full">
          <Plus aria-hidden="true" />
          Register New Animal
        </button>
      )}

      {showForm && (
        <AnimalFormModal
          initialTag={query}
          onClose={() => setShowForm(false)}
          onCreated={(animal) => navigate(captureUrl(animal.id))}
        />
      )}
    </section>
  )
}