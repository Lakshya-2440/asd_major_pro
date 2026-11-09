import { useParams } from 'react-router-dom'

type PlaceholderProps = { title: string }

export default function Placeholder({ title }: PlaceholderProps) {
  const params = useParams()

  return (
    <section className="p-4">
      <h1 className="text-2xl font-extrabold">{title}</h1>
      {params.id && <p className="mt-1 text-slate-700">Evaluation ID: {params.id}</p>}
      <p className="mt-2 text-slate-700">Coming soon.</p>
    </section>
  )
}