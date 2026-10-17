import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { ethers } from 'ethers'
import WaterGame from './WaterGame.jsx'

/* ── helpers ────────────────────────────────────────────────────────────── */
function shortAddr(addr) {
  if (!addr) return ''
  return addr.slice(0, 6) + '…' + addr.slice(-4)
}

function fmtEther(wei) {
  if (!wei) return '0'
  try {
    return ethers.formatEther(wei)
  } catch {
    return '0'
  }
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 60) return 'hace ' + seconds + 's'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return 'hace ' + minutes + ' min'
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return 'hace ' + hours + 'h'
  const days = Math.floor(hours / 24)
  return 'hace ' + days + 'd'
}

/* ── Count-up hook ── */
function useCountUp(target, duration = 1000) {
  const [value, setValue] = useState(0)
  const rafRef = useRef(null)
  const startRef = useRef(0)
  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    startRef.current = performance.now()
    const startVal = value
    const diff = target - startVal
    const animate = (now) => {
      const elapsed = now - startRef.current
      const t = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setValue(startVal + diff * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(animate)
    }
    rafRef.current = requestAnimationFrame(animate)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return value
}

/* ── config ────────────────────────────────────────────────────────────── */
const CFG = window.__QUICK_DAPP_CONFIG__ || {}
const CONTRACTS = CFG.contracts || []
const binding = CONTRACTS.find((c) => c.id === CFG.primaryContractId) || CONTRACTS[0]

if (!binding || !binding.address || !binding.abi) {
  throw new Error('No se encontró el contrato FondoBarrio en la configuración del DApp')
}

const CONTRACT_ADDRESS = binding.address
const CONTRACT_ABI = binding.abi

/* ── Main App ──────────────────────────────────────────────────────────── */
export default function App() {
  // wallet / provider
  const [account, setAccount] = useState('')
  const [signer, setSigner] = useState(null)
  const [provider, setProvider] = useState(null)
  const [connecting, setConnecting] = useState(false)

  // contract data
  const [causa, setCausa] = useState('')
  const [meta, setMeta] = useState('0')
  const [totalRecaudado, setTotalRecaudado] = useState('0')
  const [progresoPct, setProgresoPct] = useState(0)
  const [totalDonantes, setTotalDonantes] = useState(0)
  const [totalPartidas, setTotalPartidas] = useState(0)
  const [saldoContrato, setSaldoContrato] = useState('0')
  const [aportePorPartida, setAportePorPartida] = useState('0')
  const [representante, setRepresentante] = useState('')
  const [misPartidas, setMisPartidas] = useState(0)
  const [misAportes, setMisAportes] = useState('0')

  // donation form
  const [donarAmount, setDonarAmount] = useState('')
  const [donarTxStatus, setDonarTxStatus] = useState('')

  // disbursement form
  const [desemDestino, setDesemDestino] = useState('')
  const [desemMonto, setDesemMonto] = useState('')
  const [desemConcepto, setDesemConcepto] = useState('')
  const [desemTxStatus, setDesemTxStatus] = useState('')

  // game room form
  const [salaCausa, setSalaCausa] = useState('')
  const [salaMeta, setSalaMeta] = useState('')
  const [salaAporte, setSalaAporte] = useState('')
  const [salaTxStatus, setSalaTxStatus] = useState('')

  // events feed
  const [events, setEvents] = useState([])
  const [eventsCollapsed, setEventsCollapsed] = useState(false)
  const eventsRef = useRef([])

  // toast
  const [toast, setToast] = useState(null)
  const toastTimerRef = useRef(null)
  const showToast = useCallback((type, msg) => {
    setToast({ type, msg })
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setToast(null), 4500)
  }, [])

  // game
  const [isRegistering, setIsRegistering] = useState(false)
  const [gameTriggered, setGameTriggered] = useState(false)
  const [gameAmount, setGameAmount] = useState('')
  const configuredGamePrice = fmtEther(aportePorPartida)
  const gamePrice = gameAmount || (configuredGamePrice === '0.0' ? '' : configuredGamePrice)

  // loading
  const [loading, setLoading] = useState(true)

  // count-up for progress
  const animatedPct = useCountUp(progresoPct, 1200)

  /* ── wallet connect ─────────────────────────────────────────────────── */
  const connectWallet = useCallback(async () => {
    if (!window.ethereum) {
      showToast('error', 'No se encontró una billetera web3 (window.ethereum).')
      return
    }
    setConnecting(true)
    try {
      const p = new ethers.BrowserProvider(window.ethereum)
      await p.send('eth_requestAccounts', [])
      const s = await p.getSigner()
      const addr = await s.getAddress()
      setProvider(p)
      setSigner(s)
      setAccount(addr)
      showToast('success', '✅ Billetera conectada: ' + shortAddr(addr))
    } catch (err) {
      showToast('error', 'Error al conectar: ' + (err.message || err))
    } finally {
      setConnecting(false)
    }
  }, [showToast])

  // listen for account changes
  useEffect(() => {
    if (!window.ethereum) return
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        setAccount('')
        setSigner(null)
        setProvider(null)
      } else {
        const p = new ethers.BrowserProvider(window.ethereum)
        p.getSigner().then((s) => {
          setProvider(p)
          setSigner(s)
          setAccount(accounts[0])
          showToast('info', 'Cuenta cambiada: ' + shortAddr(accounts[0]))
        }).catch(() => {})
      }
    }
    window.ethereum.on?.('accountsChanged', handleAccountsChanged)
    return () => {
      window.ethereum.removeListener?.('accountsChanged', handleAccountsChanged)
    }
  }, [showToast])

  /* ── read contract data ──────────────────────────────────────────────── */
  const refreshData = useCallback(async (contractWithSigner) => {
    const c = contractWithSigner || (signer ? new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer) : null)
    if (!c) return
    try {
      const [causaRes, metaRes, recaudadoRes, pctRes, donantesRes, partidasRes, saldoRes, aporteRes, repRes] =
        await Promise.all([
          c.causa(),
          c.meta(),
          c.totalRecaudado(),
          c.progresoPorcentaje(),
          c.totalDonantes(),
          c.totalPartidas(),
          c.saldoContrato(),
          c.aportePorPartida(),
          c.representante(),
        ])
      setCausa(causaRes)
      setMeta(metaRes.toString())
      setTotalRecaudado(recaudadoRes.toString())
      setProgresoPct(Number(pctRes))
      setTotalDonantes(Number(donantesRes))
      setTotalPartidas(Number(partidasRes))
      setSaldoContrato(saldoRes.toString())
      setAportePorPartida(aporteRes.toString())
      setRepresentante(repRes)

      if (account) {
        const [misPart, misAport] = await Promise.all([
          c.partidasPorJugador(account),
          c.aportesDonantes(account),
        ])
        setMisPartidas(Number(misPart))
        setMisAportes(misAport.toString())
      }
    } catch (err) {
      console.error('Error al leer datos del contrato:', err)
    }
  }, [signer, account])

  // initial read-only load
  useEffect(() => {
    if (!window.ethereum) return
    const p = new ethers.BrowserProvider(window.ethereum)
    const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, p)
    refreshData(c).then(() => setLoading(false))
  }, [refreshData])

  // refresh on account change
  useEffect(() => {
    if (signer) {
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
      refreshData(c)
    }
  }, [account, refreshData])

  /* ── event listeners ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!window.ethereum) return
    const p = new ethers.BrowserProvider(window.ethereum)
    const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, p)

    const addEvent = (type, data) => {
      const entry = { type, data, time: new Date() }
      eventsRef.current = [entry, ...eventsRef.current].slice(0, 50)
      setEvents([...eventsRef.current])
    }

    c.on('DonacionRecibida', (donante, monto) => {
      addEvent('donacion', { donante, monto: monto.toString() })
      refreshData()
    })
    c.on('PartidaCompletada', (jugador, aporteLiberado) => {
      addEvent('partida', { jugador, aporteLiberado: aporteLiberado.toString() })
      refreshData()
    })
    c.on('FondosDesembolsados', (destino, monto, concepto) => {
      addEvent('desembolso', { destino, monto: monto.toString(), concepto })
      refreshData()
    })
    c.on('CausaActualizada', (nuevaCausa, nuevaMeta) => {
      addEvent('causa', { nuevaCausa, nuevaMeta: nuevaMeta.toString() })
      refreshData()
    })

    return () => {
      c.removeAllListeners('DonacionRecibida')
      c.removeAllListeners('PartidaCompletada')
      c.removeAllListeners('FondosDesembolsados')
      c.removeAllListeners('CausaActualizada')
    }
  }, [refreshData])

  /* ── donar ───────────────────────────────────────────────────────────── */
  const handleDonar = async () => {
    if (!signer) { showToast('error', 'Conecta tu billetera primero'); return }
    const amt = parseFloat(donarAmount)
    if (!amt || amt <= 0) { showToast('error', 'Introduce una cantidad válida'); return }
    try {
      setDonarTxStatus('Pendiente…')
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
      const wei = ethers.parseEther(donarAmount)
      const tx = await c.donar({ value: wei })
      setDonarTxStatus('Transacción enviada…')
      await tx.wait()
      setDonarTxStatus('✅ Donación confirmada')
      showToast('success', `🎉 Donación de ${donarAmount} ETH confirmada`)
      setDonarAmount('')
      refreshData()
      setTimeout(() => setDonarTxStatus(''), 4000)
    } catch (err) {
      setDonarTxStatus('❌ Error: ' + (err.reason || err.shortMessage || err.message))
      setTimeout(() => setDonarTxStatus(''), 5000)
    }
  }

  /* ── desembolsar ─────────────────────────────────────────────────────── */
  const handleDesembolsar = async () => {
    if (!signer) { showToast('error', 'Conecta tu billetera primero'); return }
    if (!desemDestino || !ethers.isAddress(desemDestino)) { showToast('error', '⚠️ Dirección de destino inválida'); return }
    const amt = parseFloat(desemMonto)
    if (!amt || amt <= 0) { showToast('error', '⚠️ Introduce una cantidad válida'); return }
    if (!desemConcepto.trim()) { showToast('error', '⚠️ Introduce un concepto'); return }
    try {
      setDesemTxStatus('Pendiente…')
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
      const wei = ethers.parseEther(desemMonto)
      const tx = await c.desembolsar(desemDestino, wei, desemConcepto)
      setDesemTxStatus('Transacción enviada…')
      await tx.wait()
      setDesemTxStatus('✅ Desembolso confirmado')
      showToast('success', '📤 Desembolso ejecutado correctamente')
      setDesemDestino('')
      setDesemMonto('')
      setDesemConcepto('')
      refreshData()
      setTimeout(() => setDesemTxStatus(''), 4000)
    } catch (err) {
      setDesemTxStatus('❌ Error: ' + (err.reason || err.shortMessage || err.message))
      setTimeout(() => setDesemTxStatus(''), 5000)
    }
  }

  /* ── crear sala ───────────────────────────────────────────────────────── */
  const handleCrearSala = async () => {
    if (!signer || !isRep) {
      showToast('error', 'Solo el representante puede crear la sala')
      return
    }
    if (!salaCausa.trim()) {
      showToast('error', 'Introduce la causa de la sala')
      return
    }
    try {
      const metaWei = ethers.parseEther(salaMeta)
      const aporteWei = ethers.parseEther(salaAporte)
      if (metaWei <= 0n || aporteWei <= 0n) throw new Error('La meta y el aporte deben ser mayores a 0')

      setSalaTxStatus('Actualizando causa…')
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
      const causaTx = await c.actualizarCausa(salaCausa.trim(), metaWei)
      await causaTx.wait()

      setSalaTxStatus('Configurando aporte…')
      const aporteTx = await c.setAportePorPartida(aporteWei)
      await aporteTx.wait()

      setSalaTxStatus('✅ Sala creada')
      showToast('success', '🎮 Sala creada y configurada en la blockchain')
      setSalaCausa('')
      setSalaMeta('')
      setSalaAporte('')
      await refreshData()
      setTimeout(() => setSalaTxStatus(''), 4000)
    } catch (err) {
      setSalaTxStatus('❌ Error: ' + (err.reason || err.shortMessage || err.message))
      setTimeout(() => setSalaTxStatus(''), 5000)
    }
  }

  /* ── game win → registrarPartida ─────────────────────────────────────── */
  const handleGameWin = useCallback(async () => {
    if (!signer) {
      showToast('error', 'Conecta tu billetera para registrar la partida')
      return
    }
    if (!gamePrice) {
      showToast('error', 'Selecciona un precio para la partida')
      return
    }
    setIsRegistering(true)
    setGameTriggered(true)
    try {
      const c = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer)
      const value = ethers.parseEther(gamePrice)
      const tx = await c.registrarPartida({ value })
      await tx.wait()
      showToast('success', `🎉 ¡Partida registrada! Pago de ${gamePrice} ETH confirmado`)
      refreshData()
    } catch (err) {
      showToast('error', 'Error al registrar partida: ' + (err.reason || err.shortMessage || err.message))
    } finally {
      setIsRegistering(false)
    }
  }, [signer, showToast, refreshData, gamePrice])

  /* ── derived ─────────────────────────────────────────────────────────── */
  const isRep = useMemo(() => {
    return account && representante && account.toLowerCase() === representante.toLowerCase()
  }, [account, representante])

  const aporteEth = useMemo(() => fmtEther(aportePorPartida), [aportePorPartida])
  const roomConfigured = Boolean(causa && BigInt(meta || 0) > 0n && BigInt(aportePorPartida || 0) > 0n)

  /* ── event icon + color ── */
  const eventMeta = (type) => {
    switch (type) {
      case 'donacion': return { icon: '💚', color: 'var(--green-light)' }
      case 'partida': return { icon: '🎮', color: 'var(--water)' }
      case 'desembolso': return { icon: '📤', color: 'var(--warn)' }
      case 'causa': return { icon: '📋', color: 'var(--gold)' }
      default: return { icon: '•', color: 'var(--blue-light)' }
    }
  }

  /* ── render ──────────────────────────────────────────────────────────── */
  return (
    <div className="wave-decoration" style={{ minHeight: '100vh' }}>
      {/* ── Header ── */}
      <header
        style={{
          background: 'linear-gradient(135deg, var(--green-deep) 0%, var(--blue-deep) 100%)',
          padding: '0.75rem 1.5rem',
          color: 'white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className="float-anim" style={{ fontSize: '2.2rem', lineHeight: 1, filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.2))' }}>💧</span>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>
              JOYN
            </h1>
            <p style={{ fontSize: '0.75rem', opacity: 0.85, margin: 0 }}>
              {CFG.subtitle || 'Juega, dona y transforma tu comunidad'}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {account ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span className="badge badge-connected pulse" style={{ fontSize: '0.85rem' }}>
                ● {shortAddr(account)}
              </span>
              {isRep && <span className="badge badge-admin">👑 Representante</span>}
            </div>
          ) : (
            <button className="btn-water" onClick={connectWallet} disabled={connecting}>
              {connecting ? <><span className="spinner" style={{ borderTopColor: 'white' }} /> Conectando…</> : '🔗 Conectar Billetera'}
            </button>
          )}
        </div>
      </header>

      {/* ── Main content ── */}
      <main style={{ maxWidth: 960, margin: '0 auto', padding: '1.5rem 1rem 3rem', display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative', zIndex: 1 }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem' }}>
            <div className="spinner" style={{ borderTopColor: 'var(--green-mid)', width: 44, height: 44, margin: '0 auto 1rem' }} />
            <p style={{ color: 'var(--text-mid)', fontWeight: 700, fontSize: '1.05rem' }}>Cargando datos del contrato…</p>
            <p style={{ color: 'var(--text-light)', fontSize: '0.85rem', marginTop: '0.5rem' }}>Conectando con el contrato FondoBarrio</p>
          </div>
        ) : (
          <>
            {/* ── Hero: Causa + Progreso + Stats ── */}
            <section className="card card-green" style={{ animation: 'countUp 0.5s ease' }}>
              <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-mid)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1.5px' }}>
                  Causa Activa
                </span>
                <h2 style={{ fontSize: '1.9rem', fontWeight: 800, color: 'var(--green-deep)', marginTop: '0.4rem', lineHeight: 1.2 }}>
                  <span style={{ display: 'inline-block', marginRight: '0.3rem' }}>💧</span>{causa || 'Cargando…'}
                </h2>
              </div>

              {/* Progress bar with shimmer + % text inside */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-dark)', fontSize: '0.9rem' }}>
                    Recaudado: <span style={{ color: 'var(--green-mid)' }}>{fmtEther(totalRecaudado)} ETH</span>
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--blue-deep)', fontSize: '0.9rem' }}>
                    Meta: {fmtEther(meta)} ETH
                  </span>
                </div>
                <div className="progress-bar-bg">
                  <div className="progress-bar-fill" style={{ width: `${Math.max(Math.min(progresoPct, 100), 3)}%` }}>
                    {Math.round(animatedPct)}%
                  </div>
                </div>
              </div>

              {/* Stats grid with icons */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.85rem' }}>
                <div className="stat-badge">
                  <span className="stat-icon">🤝</span>
                  <div className="stat-value">{totalDonantes}</div>
                  <div className="stat-label">Donantes</div>
                </div>
                <div className="stat-badge">
                  <span className="stat-icon">🎮</span>
                  <div className="stat-value">{totalPartidas}</div>
                  <div className="stat-label">Partidas</div>
                </div>
                <div className="stat-badge">
                  <span className="stat-icon">💰</span>
                  <div className="stat-value">{fmtEther(saldoContrato)}</div>
                  <div className="stat-label">Saldo (ETH)</div>
                </div>
                <div className="stat-badge">
                  <span className="stat-icon">💧</span>
                  <div className="stat-value">{fmtEther(aportePorPartida)}</div>
                  <div className="stat-label">Aporte/Partida</div>
                </div>
              </div>
            </section>

            <div className="section-divider" />

            {/* ── Two-column: Donate + Minigame ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>

              {/* Donate Card */}
              <section className="card">
                <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--green-deep)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>💚</span> Donar
                  <span className="info-tooltip" data-tip="Cada donación se registra en la blockchain">i</span>
                </h3>
                <p style={{ color: 'var(--text-mid)', fontSize: '0.9rem', marginBottom: '1.1rem', lineHeight: 1.5 }}>
                  Tu donación directa se suma al fondo comunitario. Cada MON cuenta.
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  <div>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '0.3rem', display: 'block' }}>
                      Cantidad (ETH)
                    </label>
                    <input
                      className="input-field"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.01"
                      value={donarAmount}
                      onChange={(e) => setDonarAmount(e.target.value)}
                      disabled={!account}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                      {['0.001', '0.01', '0.1', '1'].map((v) => (
                        <button
                          key={v}
                          className="quick-amount"
                          onClick={() => setDonarAmount(v)}
                          disabled={!account}
                        >
                          {v} ETH
                        </button>
                      ))}
                    </div>
                  </div>

                  {account ? (
                    <button className="btn-primary" onClick={handleDonar} disabled={!donarAmount || donarTxStatus.includes('Pendiente') || donarTxStatus.includes('enviada')}>
                      {donarTxStatus.includes('Pendiente') || donarTxStatus.includes('enviada')
                        ? <><span className="spinner" style={{ borderTopColor: 'white' }} /> {donarTxStatus}</>
                        : '💧 Donar ahora'}
                    </button>
                  ) : (
                    <button className="btn-primary" onClick={connectWallet} disabled={connecting}>
                      Conecta tu billetera para donar
                    </button>
                  )}

                  {donarTxStatus && !donarTxStatus.includes('Pendiente') && !donarTxStatus.includes('enviada') && (
                    <div style={{
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      background: donarTxStatus.includes('✅') ? 'var(--green-soft)' : 'var(--danger-soft)',
                      color: donarTxStatus.includes('✅') ? 'var(--green-deep)' : 'var(--danger)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      animation: 'slideInLeft 0.3s ease',
                    }}>
                      {donarTxStatus}
                    </div>
                  )}

                  {account && (
                    <div style={{
                      marginTop: '0.25rem',
                      padding: '0.85rem 1rem',
                      background: 'linear-gradient(135deg, var(--green-soft), rgba(212, 241, 224, 0.4))',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.85rem',
                      border: '1px solid rgba(60, 179, 113, 0.15)',
                    }}>
                      <span style={{ fontWeight: 800, color: 'var(--green-deep)' }}>Tu aporte acumulado: </span>
                      <span style={{ color: 'var(--text-dark)', fontWeight: 700 }}>{fmtEther(misAportes)} ETH</span>
                    </div>
                  )}
                </div>
              </section>

              {/* Minigame Card */}
              <section className="card">
                <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--blue-deep)', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span>🎮</span> Juega y Dona
                </h3>
                <p style={{ color: 'var(--text-mid)', fontSize: '0.9rem', marginBottom: '1rem', lineHeight: 1.5 }}>
                  Atrapa 10 gotas de agua en 30 segundos. Al ganar, se enviará el precio seleccionado a la causa.
                </p>
                {account && isRep && (
                  <div style={{ marginBottom: '1rem', padding: '1rem', background: 'var(--blue-soft)', borderRadius: 'var(--radius-md)', border: '1px solid rgba(76, 184, 224, 0.3)' }}>
                    <div style={{ fontWeight: 800, color: 'var(--blue-deep)', marginBottom: '0.75rem' }}>🏠 Crear sala</div>
                    <div style={{ display: 'grid', gap: '0.65rem' }}>
                      <input className="input-field" type="text" placeholder="Causa de la sala" value={salaCausa} onChange={(e) => setSalaCausa(e.target.value)} disabled={salaTxStatus.includes('…')} />
                      <input className="input-field" type="number" min="0" step="0.001" placeholder="Meta (ETH)" value={salaMeta} onChange={(e) => setSalaMeta(e.target.value)} disabled={salaTxStatus.includes('…')} />
                      <input className="input-field" type="number" min="0" step="0.001" placeholder="Aporte por partida (ETH)" value={salaAporte} onChange={(e) => setSalaAporte(e.target.value)} disabled={salaTxStatus.includes('…')} />
                    </div>
                    <button className="btn-primary" style={{ marginTop: '0.75rem' }} onClick={handleCrearSala} disabled={!salaCausa || !salaMeta || !salaAporte || salaTxStatus.includes('…')}>
                      {salaTxStatus.includes('…') ? <><span className="spinner" style={{ borderTopColor: 'white' }} /> {salaTxStatus}</> : '🏠 Crear sala en blockchain'}
                    </button>
                    {salaTxStatus && !salaTxStatus.includes('…') && <div style={{ marginTop: '0.65rem', fontSize: '0.85rem', fontWeight: 700 }}>{salaTxStatus}</div>}
                  </div>
                )}
                {!roomConfigured && (
                  <div style={{ marginBottom: '1rem', padding: '0.8rem 1rem', background: 'var(--warn-soft)', borderRadius: 'var(--radius-md)', color: 'var(--text-dark)', fontSize: '0.85rem', fontWeight: 700 }}>
                    Configura una sala con causa, meta y aporte por partida antes de jugar.
                  </div>
                )}
                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '0.3rem', display: 'block' }}>
                    Precio por partida (ETH)
                  </label>
                  <input
                    className="input-field"
                    type="number"
                    step="0.001"
                    min="0"
                    placeholder={aporteEth !== '0' ? aporteEth : '0.01'}
                    value={gameAmount}
                    onChange={(e) => setGameAmount(e.target.value)}
                    disabled={!account || !roomConfigured || isRegistering}
                  />
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.6rem', flexWrap: 'wrap' }}>
                    {['0.001', '0.01', '0.1', '1'].map((v) => (
                      <button
                        key={v}
                        className="quick-amount"
                        onClick={() => setGameAmount(v)}
                        disabled={!account || !roomConfigured || isRegistering}
                      >
                        {v} ETH
                      </button>
                    ))}
                  </div>
                </div>
                <WaterGame
                  onWin={handleGameWin}
                  isRegistering={isRegistering}
                  disabled={!account || !roomConfigured}
                  aportePorPartida={(gamePrice || '0') + ' ETH'}
                />
                {account && (
                  <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <div className="stat-gradient-blue" style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--blue-deep)' }}>{misPartidas}</div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-mid)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tus partidas</div>
                    </div>
                    <div className="stat-gradient-green" style={{ flex: 1, minWidth: 120 }}>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--green-deep)' }}>
                        {fmtEther((BigInt(misPartidas) * BigInt(aportePorPartida || 0)).toString())}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--text-mid)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Tu aporte liberado (ETH)</div>
                    </div>
                  </div>
                )}
                {isRegistering && (
                  <div style={{
                    marginTop: '0.85rem',
                    padding: '0.85rem 1rem',
                    background: 'var(--blue-soft)',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.9rem',
                    fontWeight: 700,
                    color: 'var(--blue-deep)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    animation: 'slideInLeft 0.3s ease',
                  }}>
                    <span className="spinner" style={{ borderTopColor: 'var(--blue-mid)' }} />
                    Registrando partida en la blockchain…
                  </div>
                )}
              </section>
            </div>

            <div className="section-divider" />

            {/* ── Disbursement (admin only) ── */}
            {account && isRep && (
              <section className="card" style={{ border: '2px solid var(--warn)', boxShadow: '0 4px 24px rgba(243, 156, 18, 0.1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '1.3rem' }}>📋</span>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0 }}>
                    Desembolso de Fondos
                  </h3>
                  <span className="badge badge-admin" style={{ marginLeft: 'auto' }}>Admin</span>
                </div>
                <p style={{ color: 'var(--text-mid)', fontSize: '0.9rem', marginBottom: '1.1rem', lineHeight: 1.5 }}>
                  Como representante, puedes desembolsar fondos del contrato a una dirección de destino.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.85rem' }}>
                  <div>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '0.3rem', display: 'block' }}>
                      Dirección de destino
                    </label>
                    <input
                      className="input-field"
                      type="text"
                      placeholder="0x…"
                      value={desemDestino}
                      onChange={(e) => setDesemDestino(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '0.3rem', display: 'block' }}>
                      Monto (ETH)
                    </label>
                    <input
                      className="input-field"
                      type="number"
                      step="0.001"
                      min="0"
                      placeholder="0.1"
                      value={desemMonto}
                      onChange={(e) => setDesemMonto(e.target.value)}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-dark)', marginBottom: '0.3rem', display: 'block' }}>
                      Concepto
                    </label>
                    <input
                      className="input-field"
                      type="text"
                      placeholder="Ej: Compra de filtros de agua"
                      value={desemConcepto}
                      onChange={(e) => setDesemConcepto(e.target.value)}
                    />
                  </div>
                  <button
                    className="btn-primary"
                    onClick={handleDesembolsar}
                    disabled={!desemDestino || !desemMonto || !desemConcepto || desemTxStatus.includes('Pendiente') || desemTxStatus.includes('enviada')}
                  >
                    {desemTxStatus.includes('Pendiente') || desemTxStatus.includes('enviada')
                      ? <><span className="spinner" style={{ borderTopColor: 'white' }} /> {desemTxStatus}</>
                      : '📤 Desembolsar'}
                  </button>
                  {desemTxStatus && !desemTxStatus.includes('Pendiente') && !desemTxStatus.includes('enviada') && (
                    <div style={{
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '0.9rem',
                      fontWeight: 700,
                      background: desemTxStatus.includes('✅') ? 'var(--green-soft)' : 'var(--danger-soft)',
                      color: desemTxStatus.includes('✅') ? 'var(--green-deep)' : 'var(--danger)',
                      animation: 'slideInLeft 0.3s ease',
                    }}>
                      {desemTxStatus}
                    </div>
                  )}
                </div>
              </section>
            )}

            {/* ── Events Feed ── */}
            <section className="card">
              <div
                className="events-toggle"
                onClick={() => setEventsCollapsed(!eventsCollapsed)}
                style={{ marginBottom: eventsCollapsed ? 0 : '0.85rem' }}
              >
                <h3 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--text-dark)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  📡 Registro de Eventos
                </h3>
                <span className="live-badge">
                  <span className="live-dot" />
                  LIVE
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-mid)', marginLeft: 'auto' }}>
                  {events.length} evento{events.length !== 1 ? 's' : ''}
                </span>
                <span className={`events-toggle-icon ${eventsCollapsed ? '' : 'open'}`}>▼</span>
              </div>
              {!eventsCollapsed && (
                <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                  {events.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2.5rem 1rem', color: 'var(--text-mid)' }}>
                      <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem', opacity: 0.4 }}>📡</div>
                      <p style={{ fontSize: '1rem', fontWeight: 700 }}>Sin eventos todavía</p>
                      <p style={{ fontSize: '0.85rem', marginTop: '0.5rem', color: 'var(--text-light)' }}>
                        Las donaciones, partidas jugadas y desembolsos aparecerán aquí en tiempo real.
                      </p>
                    </div>
                  ) : (
                    events.map((ev, i) => {
                      let cls = 'event-item'
                      let desc = ''
                      const meta = eventMeta(ev.type)
                      if (ev.type === 'donacion') {
                        cls += ' event-donacion'
                        desc = `Donación de ${fmtEther(ev.data.monto)} ETH por ${shortAddr(ev.data.donante)}`
                      } else if (ev.type === 'partida') {
                        cls += ' event-partida'
                        desc = `Partida completada — ${fmtEther(ev.data.aporteLiberado)} ETH liberados por ${shortAddr(ev.data.jugador)}`
                      } else if (ev.type === 'desembolso') {
                        cls += ' event-desembolso'
                        desc = `Desembolso de ${fmtEther(ev.data.monto)} ETH a ${shortAddr(ev.data.destino)} — ${ev.data.concepto}`
                      } else if (ev.type === 'causa') {
                        cls += ' event-causa'
                        desc = `Causa actualizada: "${ev.data.nuevaCausa}" (meta: ${fmtEther(ev.data.nuevaMeta)} ETH)`
                      }
                      return (
                        <div key={i} className={cls} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                          <span style={{ fontSize: '1.25rem', lineHeight: '1.4', filter: `drop-shadow(0 2px 4px ${meta.color}40)` }}>{meta.icon}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-dark)', lineHeight: 1.4 }}>{desc}</div>
                            <div className="time-ago">{timeAgo(ev.time)} · {ev.time.toLocaleTimeString()}</div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </section>
          </>
        )}

        {/* ── Footer ── */}
        <footer style={{ textAlign: 'center', padding: '1.5rem 0 0.5rem', color: 'var(--text-mid)', fontSize: '0.82rem', position: 'relative', zIndex: 1 }}>
          <p style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            <span>joyn</span>
            <span style={{ opacity: 0.4 }}>·</span>
            <span>Contrato:</span>
            <span
              className="footer-link"
              onClick={() => {
                if (navigator.clipboard) {
                  navigator.clipboard.writeText(CONTRACT_ADDRESS)
                  showToast('info', '📋 Dirección copiada al portapapeles')
                }
              }}
              title="Click para copiar"
            >
              {shortAddr(CONTRACT_ADDRESS)}
            </span>
          </p>
          <p style={{ marginTop: '0.3rem', opacity: 0.65, fontSize: '0.78rem' }}>Cada partida, cada donación, un paso más hacia la meta.</p>
        </footer>
      </main>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
