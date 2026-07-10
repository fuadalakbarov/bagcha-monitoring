const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/adminAuth');
const { query, insert, update, del } = require('../db/database');

function avg(arr, key) {
  const vals = arr.map(r => r[key]).filter(v => v != null);
  if (!vals.length) return 0;
  return Math.round((vals.reduce((a,b)=>a+b,0)/vals.length)*100)/100;
}

// ── Dashboard ────────────────────────────────────────────────────
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const [kgs, tokens, responses, regs] = await Promise.all([
      query('kindergartens', { select: 'id,name,region,target', order: 'name.asc' }),
      query('survey_tokens', { select: 'id,is_used' }),
      query('survey_responses', {
        select: 'id,kindergarten_id,pin_code,volume_rating,quality_rating,taste_rating,hygiene_rating,comment,submitted_at'
      }),
      query('registrations', {
        select: 'pin_code,surname,name,patronymic,child_name,phone'
      })
    ]);

    // pin → valideyn xəritəsi
    const regByPin = {};
    regs.forEach(r => { regByPin[r.pin_code] = r; });

    const stats = {
      active_pins: tokens.filter(t=>!t.is_used).length,
      used_pins:   tokens.filter(t=>t.is_used).length,
      total_pins:  tokens.length,
      total_responses: responses.length,
      total_kg: kgs.length
    };

    // Hər bağça üzrə: ortalar + fərdi cavablar
    const kindergartens = kgs.map(k => {
      const rs = responses.filter(r => r.kindergarten_id === k.id);
      const av=avg(rs,'volume_rating'), aq=avg(rs,'quality_rating'),
            at=avg(rs,'taste_rating'),  ah=avg(rs,'hygiene_rating');
      const overall = rs.length
        ? Math.round(((av+aq+at+ah)/4)*100)/100 : 0;

      // Fərdi cavablar (valideyn adı ilə)
      const individual = rs.map(r => {
        const reg = regByPin[r.pin_code];
        return {
          parent: reg ? `${reg.surname||''} ${reg.name||''} ${reg.patronymic||''}`.trim() : '—',
          child:  reg ? reg.child_name || '—' : '—',
          phone:  reg ? reg.phone || '—' : '—',
          volume_rating:  r.volume_rating,
          quality_rating: r.quality_rating,
          taste_rating:   r.taste_rating,
          hygiene_rating: r.hygiene_rating,
          overall: Math.round(((r.volume_rating+r.quality_rating+r.taste_rating+r.hygiene_rating)/4)*100)/100,
          comment: r.comment || null,
          submitted_at: r.submitted_at
        };
      }).sort((a,b)=>(b.submitted_at||'').localeCompare(a.submitted_at||''));

      return {
        id: k.id, name: k.name, region: k.region, target: k.target,
        participant_count: rs.length,
        avg_volume: av, avg_quality: aq, avg_taste: at, avg_hygiene: ah,
        overall_avg: overall,
        individual
      };
    });

    // Şərhlər — valideyn adı ilə
    const comments = responses
      .filter(r => r.comment?.trim())
      .sort((a,b)=>(b.submitted_at||'').localeCompare(a.submitted_at||''))
      .slice(0,100)
      .map(r => {
        const kg  = kgs.find(k=>k.id===r.kindergarten_id);
        const reg = regByPin[r.pin_code];
        return {
          comment: r.comment,
          submitted_at: r.submitted_at,
          kindergarten_name: kg?.name || '—',
          parent: reg ? `${reg.surname||''} ${reg.name||''} ${reg.patronymic||''}`.trim() : '—'
        };
      });

    // Son 7 günün trendi
    const now = new Date();
    const weekAgo = new Date(now.getTime()-7*86400000).toISOString().slice(0,10);
    const byDay = {};
    responses.forEach(r => {
      const day=(r.submitted_at||'').slice(0,10);
      if(!day||day<weekAgo) return;
      if(!byDay[day]) byDay[day]=[];
      byDay[day].push((r.volume_rating+r.quality_rating+r.taste_rating+r.hygiene_rating)/4);
    });
    const trend = Object.keys(byDay).sort().map(day=>({
      day, count: byDay[day].length,
      avg_score: Math.round((byDay[day].reduce((a,b)=>a+b,0)/byDay[day].length)*100)/100
    }));

    res.json({ stats, kindergartens, comments, trend });
  } catch(e) {
    console.error('dashboard error:', e);
    res.status(500).json({ error: 'Server xətası' });
  }
});

// ── Bağça siyahısı (public) ──────────────────────────────────────
router.get('/kindergartens/public', async (req,res) => {
  try { res.json(await query('kindergartens',{select:'id,name,region',order:'name.asc'})); }
  catch(e){ res.status(500).json({error:'Server xətası'}); }
});

// ── Bağça siyahısı (admin) ───────────────────────────────────────
router.get('/kindergartens', requireAdmin, async (req,res) => {
  try { res.json(await query('kindergartens',{select:'id,name,region,target',order:'name.asc'})); }
  catch(e){ res.status(500).json({error:'Server xətası'}); }
});

router.post('/kindergartens', requireAdmin, async (req,res) => {
  const {name,region,target}=req.body;
  if(!name?.trim()||!region?.trim()) return res.status(400).json({error:'Ad və region tələb olunur'});
  try { const r=await insert('kindergartens',{name:name.trim(),region:region.trim(),target:Number(target)||2.5}); res.json(r[0]||{ok:true}); }
  catch(e){ res.status(500).json({error:'Server xətası'}); }
});

router.put('/kindergartens/:id', requireAdmin, async (req,res) => {
  const {name,region,target}=req.body;
  if(!name?.trim()||!region?.trim()) return res.status(400).json({error:'Ad və region tələb olunur'});
  try {
    const r=await update('kindergartens',{id:parseInt(req.params.id)},{name:name.trim(),region:region.trim(),target:Number(target)||2.5});
    if(!r.length) return res.status(404).json({error:'Tapılmadı'});
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:'Server xətası'}); }
});

router.delete('/kindergartens/:id', requireAdmin, async (req,res) => {
  const id=parseInt(req.params.id);
  try {
    await del('survey_tokens',{kindergarten_id:id});
    await del('survey_responses',{kindergarten_id:id});
    await del('registrations',{kindergarten_id:id});
    await del('kindergartens',{id});
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:'Server xətası'}); }
});

// ── Randevular ───────────────────────────────────────────────────
const SLOT_LABEL = '11:30 – 13:00';

router.get('/registrations', requireAdmin, async (req,res) => {
  try {
    const [regs, kgs, tokens] = await Promise.all([
      query('registrations',{select:'*',order:'appt_date.desc'}),
      query('kindergartens',{select:'id,name,region'}),
      query('survey_tokens',{select:'pin_code,is_used'})
    ]);
    const kgMap={}, usedMap={};
    kgs.forEach(k=>{kgMap[k.id]=k;});
    tokens.forEach(t=>{usedMap[t.pin_code]=!!t.is_used;});
    res.json({ registrations: regs.map(r=>({
      id:r.id,
      parent:`${r.surname||''} ${r.name||''} ${r.patronymic||''}`.trim(),
      child:`${r.child_surname||''} ${r.child_name||''} ${r.child_patronymic||''}`.trim()||'—',
      phone:r.phone,
      kindergarten: kgMap[r.kindergarten_id]?.name||'—',
      region: kgMap[r.kindergarten_id]?.region||'—',
      appt_date:r.appt_date,
      slot: SLOT_LABEL,
      pin:r.pin_code,
      used:usedMap[r.pin_code]||false
    }))});
  } catch(e){ res.status(500).json({error:'Server xətası'}); }
});

router.delete('/registrations/:id', requireAdmin, async (req,res) => {
  const id=parseInt(req.params.id);
  try {
    const ex=await query('registrations',{id:`eq.${id}`});
    if(!ex.length) return res.status(404).json({error:'Tapılmadı'});
    await del('registrations',{id});
    if(ex[0].pin_code) await del('survey_tokens',{pin_code:ex[0].pin_code});
    res.json({ok:true});
  } catch(e){ res.status(500).json({error:'Server xətası'}); }
});

module.exports = router;
