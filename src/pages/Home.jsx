import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'

export default function Home({ user, streams = [], activeStream, setActiveStream }) {
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    (async () => {
      if (!activeStream?.id) {
        setSubjects([])
        setLoading(false)
        return
      }
      setLoading(true)
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name')
        .eq('stream_id', activeStream.id)
        .order('name', { ascending: true })
      if (!error) setSubjects(data || [])
      setLoading(false)
    })()
  }, [activeStream])

  return (
    <div className="container">
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <h1 className="title">📚 Notes-chain</h1>

        {isAdmin && streams.length > 0 && (
          <select
            value={activeStream?.id || ''}
            onChange={(e) => {
              const chosen = streams.find(s => s.id === e.target.value)
              setActiveStream(chosen || null)
            }}
            style={{ padding: '6px 8px', borderRadius: 8 }}
          >
            {streams.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {!activeStream ? (
        <p>Поток не выбран. {isAdmin ? 'Выбери поток в списке выше.' : 'Обратись к администратору для назначения потока.'}</p>
      ) : loading ? (
        <p>Загрузка…</p>
      ) : (
        <div className="menu">
          {subjects.map((s) => (
            <button key={s.id} className="menu-btn" onClick={() => navigate(`/s/${s.name}`)}>
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
