import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'


export default function Home(){
const [subjects, setSubjects] = useState([])
const [loading, setLoading] = useState(true)
const navigate = useNavigate()


useEffect(() => {
(async () => {
const { data, error } = await supabase
.from('subjects')
.select('id, name')
.order('name', { ascending: true })
if (!error) setSubjects(data || [])
setLoading(false)
})()
}, [])


return (
<div className="container">
<h1 className="title">📚 Notes‑chain</h1>
<p className="subtitle">|||||||||||||</p>
{loading ? (
<p>Загрузка…</p>
) : (
<div className="menu">
{subjects.map((s) => (
<button
key={s.id}
className="menu-btn"
onClick={() => navigate(`/s/${s.name}`)}

>
{s.name}
</button>
))}
</div>
)}
</div>
)
}