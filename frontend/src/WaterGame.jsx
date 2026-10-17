import React, { useState, useEffect, useRef, useCallback } from 'react'

const CANVAS_W = 360
const CANVAS_H = 460
const BASKET_W = 72
const BASKET_H = 34
const BASKET_Y = CANVAS_H - 48
const DROP_R = 14
const DROPS_TO_WIN = 10
const GAME_TIME = 30

const rand = (min, max) => Math.random() * (max - min) + min

// Safe rounded rectangle path (roundRect polyfill for older browsers)
function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function WaterGame({ onWin, isRegistering, disabled }) {
  const canvasRef = useRef(null)
  const animRef = useRef(null)
  const keysRef = useRef({ left: false, right: false })
  const pointerXRef = useRef(null)
  const flashRef = useRef(null)
  const bubblesRef = useRef([])
  const confettiRef = useRef([])
  const gameStateRef = useRef({
    state: 'idle',
    drops: [],
    basketX: (CANVAS_W - BASKET_W) / 2,
    caught: 0,
    timeLeft: GAME_TIME,
    lastFrameTime: 0,
    dropTimer: 0,
    dropInterval: 0.85,
    ripples: [],
    splashParticles: [],
    flashAlpha: 0,
    elapsed: 0,
  })

  const [, forceRender] = useState(0)
  const [uiState, setUiState] = useState('idle')
  const [uiCaught, setUiCaught] = useState(0)
  const [uiTimeLeft, setUiTimeLeft] = useState(GAME_TIME)

  // Initialize background bubbles
  useEffect(() => {
    bubblesRef.current = Array.from({ length: 12 }, () => ({
      x: rand(0, CANVAS_W),
      y: rand(0, CANVAS_H),
      r: rand(3, 10),
      speed: rand(8, 20),
      drift: rand(-0.3, 0.3),
    }))
  }, [])

  const stopGame = useCallback(() => {
    if (animRef.current) {
      cancelAnimationFrame(animRef.current)
      animRef.current = null
    }
  }, [])

  const resetGame = useCallback(() => {
    const gs = gameStateRef.current
    gs.state = 'idle'
    gs.drops = []
    gs.basketX = (CANVAS_W - BASKET_W) / 2
    gs.caught = 0
    gs.timeLeft = GAME_TIME
    gs.dropTimer = 0
    gs.dropInterval = 0.85
    gs.ripples = []
    gs.splashParticles = []
    gs.flashAlpha = 0
    gs.elapsed = 0
    confettiRef.current = []
    setUiState('idle')
    setUiCaught(0)
    setUiTimeLeft(GAME_TIME)
  }, [])

  const drawDrop = (ctx, x, y) => {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(x, y - DROP_R - 2)
    ctx.bezierCurveTo(x - DROP_R, y - DROP_R / 2, x - DROP_R, y + DROP_R / 2, x, y + DROP_R)
    ctx.bezierCurveTo(x + DROP_R, y + DROP_R / 2, x + DROP_R, y - DROP_R / 2, x, y - DROP_R - 2)
    ctx.closePath()
    const grad = ctx.createLinearGradient(x, y - DROP_R, x, y + DROP_R)
    grad.addColorStop(0, 'rgba(140, 210, 245, 0.95)')
    grad.addColorStop(0.5, 'rgba(92, 198, 232, 0.9)')
    grad.addColorStop(1, 'rgba(30, 120, 180, 0.95)')
    ctx.fillStyle = grad
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    // shine highlight
    ctx.beginPath()
    ctx.ellipse(x - 4, y - 4, 3.5, 6, -0.3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.55)'
    ctx.fill()
    // small inner shine
    ctx.beginPath()
    ctx.arc(x - 2, y - 2, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.8)'
    ctx.fill()
    ctx.restore()
  }

  const drawBasket = (ctx, x) => {
    ctx.save()
    // basket body with gradient
    const grad = ctx.createLinearGradient(x, BASKET_Y, x, BASKET_Y + BASKET_H)
    grad.addColorStop(0, '#3cb371')
    grad.addColorStop(1, '#1a6b3f')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(x, BASKET_Y)
    ctx.lineTo(x + BASKET_W, BASKET_Y)
    ctx.lineTo(x + BASKET_W - 8, BASKET_Y + BASKET_H)
    ctx.lineTo(x + 8, BASKET_Y + BASKET_H)
    ctx.closePath()
    ctx.fill()
    // basket handle
    ctx.strokeStyle = '#2a8a5f'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(x + BASKET_W / 2, BASKET_Y, BASKET_W / 2 + 2, Math.PI, 0, false)
    ctx.stroke()
    // basket rim ellipse
    ctx.strokeStyle = '#4dd980'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.ellipse(x + BASKET_W / 2, BASKET_Y, BASKET_W / 2, 7, 0, 0, Math.PI * 2)
    ctx.stroke()
    // water inside (semi-circle)
    ctx.beginPath()
    ctx.ellipse(x + BASKET_W / 2, BASKET_Y, BASKET_W / 2 - 3, 5, 0, 0, Math.PI)
    ctx.fillStyle = 'rgba(92, 198, 232, 0.7)'
    ctx.fill()
    // water shine
    ctx.beginPath()
    ctx.ellipse(x + BASKET_W / 2 - 5, BASKET_Y - 1, 4, 2, 0, 0, Math.PI)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fill()
    ctx.restore()
  }

  const drawRipple = (ctx, r) => {
    ctx.save()
    ctx.beginPath()
    ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2)
    ctx.strokeStyle = `rgba(92, 198, 232, ${r.alpha})`
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  }

  const drawSplash = (ctx, p) => {
    ctx.save()
    ctx.beginPath()
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(140, 210, 245, ${p.alpha})`
    ctx.fill()
    ctx.restore()
  }

  const drawBubbles = (ctx, dt) => {
    ctx.save()
    ctx.globalAlpha = 0.08
    bubblesRef.current.forEach((b) => {
      b.y -= b.speed * dt
      b.x += b.drift
      if (b.y < -b.r) {
        b.y = CANVAS_H + b.r
        b.x = rand(0, CANVAS_W)
      }
      ctx.beginPath()
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
      ctx.fillStyle = '#5cc6e8'
      ctx.fill()
      // bubble highlight
      ctx.beginPath()
      ctx.arc(b.x - b.r * 0.3, b.y - b.r * 0.3, b.r * 0.3, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)'
      ctx.fill()
    })
    ctx.restore()
  }

  const drawConfetti = (ctx, dt) => {
    const confetti = confettiRef.current
    if (confetti.length === 0) return
    ctx.save()
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i]
      c.x += c.vx * dt
      c.y += c.vy * dt
      c.vy += 150 * dt
      c.rotation += c.rotSpeed * dt
      c.alpha -= 0.5 * dt
      if (c.alpha <= 0) {
        confetti.splice(i, 1)
        continue
      }
      ctx.save()
      ctx.translate(c.x, c.y)
      ctx.rotate(c.rotation)
      ctx.globalAlpha = Math.max(0, c.alpha)
      ctx.fillStyle = c.color
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h)
      ctx.restore()
    }
    ctx.restore()
  }

  const spawnConfetti = () => {
    const colors = ['#3cb371', '#5cc6e8', '#f39c12', '#e74c3c', '#9b59b6', '#2ecc71', '#1e7ba8']
    for (let i = 0; i < 40; i++) {
      confettiRef.current.push({
        x: CANVAS_W / 2 + rand(-30, 30),
        y: CANVAS_H / 2 - 40,
        vx: rand(-120, 120),
        vy: rand(-250, -100),
        w: rand(6, 12),
        h: rand(4, 8),
        rotation: rand(0, Math.PI * 2),
        rotSpeed: rand(-8, 8),
        alpha: 1,
        color: colors[Math.floor(rand(0, colors.length))],
      })
    }
  }

  const drawIdleScreen = (ctx) => {
    ctx.save()
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(10, 40, 60, 0.72)'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    // Decorative animated drops in background
    const t = Date.now() / 1000
    for (let i = 0; i < 6; i++) {
      const dx = (i * 61 + 30) % CANVAS_W
      const dy = ((t * 25 + i * 80) % (CANVAS_H + 40)) - 20
      ctx.globalAlpha = 0.08 + Math.sin(t + i) * 0.03
      ctx.fillStyle = '#5cc6e8'
      ctx.beginPath()
      ctx.arc(dx, dy, 8 + i % 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    // Title with glow
    ctx.shadowColor = 'rgba(92, 198, 232, 0.5)'
    ctx.shadowBlur = 15
    ctx.fillStyle = '#5cc6e8'
    ctx.font = 'bold 26px Poppins, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('💧 Atrapa Gotas!', CANVAS_W / 2, 155)
    ctx.shadowBlur = 0
    ctx.fillStyle = '#b0e0f0'
    ctx.font = '16px Nunito, sans-serif'
    ctx.fillText('Atrapa 10 gotas en 30 segundos', CANVAS_W / 2, 195)
    ctx.fillStyle = 'rgba(176, 224, 240, 0.8)'
    ctx.font = '14px Nunito, sans-serif'
    ctx.fillText('Usa ← → o el ratón para mover', CANVAS_W / 2, 225)
    ctx.fillText('la canasta', CANVAS_W / 2, 245)
    // Pulsing hint text
    const pulseAlpha = 0.6 + Math.sin(t * 3) * 0.3
    ctx.fillStyle = `rgba(92, 198, 232, ${pulseAlpha})`
    ctx.font = 'bold 18px Nunito, sans-serif'
    ctx.fillText('▶ Presiona Jugar', CANVAS_W / 2, 295)
    ctx.restore()
  }

  const drawEndScreen = (ctx, won) => {
    ctx.save()
    ctx.fillStyle = won ? 'rgba(10, 60, 40, 0.82)' : 'rgba(10, 40, 60, 0.8)'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
    if (won) {
      // Glow effect
      ctx.shadowColor = 'rgba(60, 179, 113, 0.6)'
      ctx.shadowBlur = 20
      ctx.fillStyle = '#3cb371'
      ctx.font = 'bold 30px Poppins, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('🎉 ¡Ganaste!', CANVAS_W / 2, 170)
      ctx.shadowBlur = 0
      ctx.fillStyle = '#d4f1e0'
      ctx.font = '17px Nunito, sans-serif'
      ctx.fillText('10 gotas atrapadas', CANVAS_W / 2, 205)
      // Floating particles
      const t = Date.now() / 1000
      for (let i = 0; i < 8; i++) {
        const px = (i * 45 + 20) % CANVAS_W
        const py = 300 + Math.sin(t * 2 + i) * 15
        ctx.globalAlpha = 0.3 + Math.sin(t * 3 + i) * 0.2
        ctx.fillStyle = ['#3cb371', '#5cc6e8', '#f39c12'][i % 3]
        ctx.beginPath()
        ctx.arc(px, py, 4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    } else {
      ctx.fillStyle = '#f39c12'
      ctx.font = 'bold 26px Poppins, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText('⏰ Tiempo agotado', CANVAS_W / 2, 170)
      ctx.fillStyle = '#fef5e7'
      ctx.font = '16px Nunito, sans-serif'
      ctx.fillText(`Atrapaste ${gameStateRef.current.caught} de ${DROPS_TO_WIN}`, CANVAS_W / 2, 205)
      ctx.fillStyle = '#b0e0f0'
      ctx.font = '15px Nunito, sans-serif'
      ctx.fillText('¡No te rindas! Inténtalo de nuevo 🔄', CANVAS_W / 2, 240)
      // Encouraging subtext
      ctx.fillStyle = 'rgba(176, 224, 240, 0.6)'
      ctx.font = '13px Nunito, sans-serif'
      ctx.fillText('Cada intento cuenta 💪', CANVAS_W / 2, 270)
    }
    ctx.restore()
  }

  const gameLoop = useCallback((timestamp) => {
    const gs = gameStateRef.current
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    if (gs.state !== 'playing' && gs.state !== 'won' && gs.state !== 'lost') return

    if (gs.state === 'won' || gs.state === 'lost') {
      // Continue drawing for confetti and animated end screen
      if (!gs.lastFrameTime) gs.lastFrameTime = timestamp
      const dt = (timestamp - gs.lastFrameTime) / 1000
      gs.lastFrameTime = timestamp

      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
      drawScene(ctx, gs, dt)
      if (gs.state === 'won') {
        drawEndScreen(ctx, true)
        drawConfetti(ctx, dt)
      } else {
        drawEndScreen(ctx, false)
      }
      // Keep animating end screen
      animRef.current = requestAnimationFrame(gameLoop)
      return
    }

    if (!gs.lastFrameTime) gs.lastFrameTime = timestamp
    const dt = Math.min((timestamp - gs.lastFrameTime) / 1000, 0.1)
    gs.lastFrameTime = timestamp
    gs.elapsed += dt

    // Update timer
    gs.timeLeft -= dt
    if (gs.timeLeft <= 0) {
      gs.timeLeft = 0
      gs.state = 'lost'
      setUiState('lost')
      setUiTimeLeft(0)
      gs.lastFrameTime = 0
      ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
      drawScene(ctx, gs, dt)
      drawEndScreen(ctx, false)
      animRef.current = requestAnimationFrame(gameLoop)
      return
    }

    // Update basket position
    const speed = 300
    if (pointerXRef.current !== null) {
      gs.basketX = Math.max(0, Math.min(CANVAS_W - BASKET_W, pointerXRef.current - BASKET_W / 2))
    } else {
      if (keysRef.current.left) gs.basketX -= speed * dt
      if (keysRef.current.right) gs.basketX += speed * dt
      gs.basketX = Math.max(0, Math.min(CANVAS_W - BASKET_W, gs.basketX))
    }

    // Spawn drops — smoother difficulty curve
    gs.dropTimer += dt
    if (gs.dropTimer >= gs.dropInterval) {
      gs.dropTimer = 0
      gs.drops.push({
        x: rand(DROP_R + 10, CANVAS_W - DROP_R - 10),
        y: -DROP_R,
        vy: rand(140, 210),
      })
      // Smoother curve: starts at 0.85, decelerates to 0.5
      const progress = gs.elapsed / GAME_TIME
      gs.dropInterval = Math.max(0.5, 0.85 - progress * 0.35)
    }

    // Update drops
    for (let i = gs.drops.length - 1; i >= 0; i--) {
      const drop = gs.drops[i]
      drop.y += drop.vy * dt

      // Check collision with basket
      if (drop.y + DROP_R >= BASKET_Y && drop.y - DROP_R <= BASKET_Y + BASKET_H) {
        if (drop.x >= gs.basketX - 4 && drop.x <= gs.basketX + BASKET_W + 4) {
          // Caught!
          gs.caught++
          setUiCaught(gs.caught)
          // Flash effect
          gs.flashAlpha = 0.4
          // Add ripple and splash
          gs.ripples.push({ x: drop.x, y: BASKET_Y, radius: 5, alpha: 0.8 })
          for (let s = 0; s < 8; s++) {
            gs.splashParticles.push({
              x: drop.x,
              y: BASKET_Y,
              vx: rand(-70, 70),
              vy: rand(-100, -30),
              size: rand(2, 5),
              alpha: 1,
            })
          }
          gs.drops.splice(i, 1)

          if (gs.caught >= DROPS_TO_WIN) {
            gs.state = 'won'
            setUiState('won')
            gs.lastFrameTime = 0
            spawnConfetti()
            ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
            drawScene(ctx, gs, dt)
            drawEndScreen(ctx, true)
            drawConfetti(ctx, dt)
            if (onWin) onWin()
            animRef.current = requestAnimationFrame(gameLoop)
            return
          }
          continue
        }
      }

      // Drop missed (fell below canvas)
      if (drop.y > CANVAS_H + DROP_R) {
        gs.drops.splice(i, 1)
      }
    }

    // Update ripples
    for (let i = gs.ripples.length - 1; i >= 0; i--) {
      const r = gs.ripples[i]
      r.radius += 60 * dt
      r.alpha -= 1.5 * dt
      if (r.alpha <= 0) gs.ripples.splice(i, 1)
    }

    // Update splash particles
    for (let i = gs.splashParticles.length - 1; i >= 0; i--) {
      const p = gs.splashParticles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 220 * dt
      p.alpha -= 2 * dt
      if (p.alpha <= 0) gs.splashParticles.splice(i, 1)
    }

    // Decay flash
    if (gs.flashAlpha > 0) {
      gs.flashAlpha -= 2 * dt
      if (gs.flashAlpha < 0) gs.flashAlpha = 0
    }

    // Draw
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
    drawScene(ctx, gs, dt)

    // Flash overlay
    if (gs.flashAlpha > 0) {
      ctx.save()
      ctx.fillStyle = `rgba(92, 198, 232, ${gs.flashAlpha})`
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)
      ctx.restore()
    }

    // Update UI time display
    setUiTimeLeft(Math.ceil(gs.timeLeft))

    animRef.current = requestAnimationFrame(gameLoop)
  }, [onWin])

  const drawScene = (ctx, gs, dt = 0) => {
    // Background water gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_H)
    bgGrad.addColorStop(0, '#0f3858')
    bgGrad.addColorStop(0.4, '#1a4a70')
    bgGrad.addColorStop(0.8, '#2a6a8c')
    bgGrad.addColorStop(1, '#3a8aac')
    ctx.fillStyle = bgGrad
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // Animated bubbles
    if (dt > 0) {
      drawBubbles(ctx, dt)
    } else {
      // Static for idle screen
      ctx.save()
      ctx.globalAlpha = 0.06
      bubblesRef.current.forEach((b) => {
        ctx.beginPath()
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2)
        ctx.fillStyle = '#5cc6e8'
        ctx.fill()
      })
      ctx.restore()
    }

    // Drops
    gs.drops.forEach((d) => drawDrop(ctx, d.x, d.y))

    // Ripples
    gs.ripples.forEach((r) => drawRipple(ctx, r))

    // Splash particles
    gs.splashParticles.forEach((p) => drawSplash(ctx, p))

    // Basket
    drawBasket(ctx, gs.basketX)

    // HUD with semi-transparent background bars
    if (gs.state === 'playing' || gs.state === 'idle') {
      ctx.save()
      // Score pill (left)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
      roundRectPath(ctx, 8, 8, 80, 26, 13)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = 'bold 15px Poppins, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText(`💧 ${gs.caught}/${DROPS_TO_WIN}`, 16, 26)

      // Timer pill (right)
      const t = Math.ceil(gs.timeLeft)
      const timerColor = t <= 5 ? '#ff6b6b' : 'rgba(255,255,255,0.9)'
      ctx.fillStyle = t <= 5 ? 'rgba(231, 76, 60, 0.3)' : 'rgba(0, 0, 0, 0.3)'
      roundRectPath(ctx, CANVAS_W - 68, 8, 60, 26, 13)
      ctx.fill()
      ctx.fillStyle = timerColor
      ctx.font = 'bold 15px Poppins, sans-serif'
      ctx.textAlign = 'center'
      ctx.fillText(`⏱ ${t}s`, CANVAS_W - 38, 26)
      ctx.restore()
    }
  }

  const startGame = useCallback(() => {
    if (disabled) return
    resetGame()
    const gs = gameStateRef.current
    gs.state = 'playing'
    gs.lastFrameTime = 0
    setUiState('playing')
    animRef.current = requestAnimationFrame(gameLoop)
  }, [disabled, resetGame, gameLoop])

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') { keysRef.current.left = true; pointerXRef.current = null }
      if (e.key === 'ArrowRight') { keysRef.current.right = true; pointerXRef.current = null }
    }
    const handleKeyUp = (e) => {
      if (e.key === 'ArrowLeft') keysRef.current.left = false
      if (e.key === 'ArrowRight') keysRef.current.right = false
    }
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => stopGame()
  }, [stopGame])

  // Draw idle screen on mount
  useEffect(() => {
    if (uiState === 'idle' && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      drawScene(ctx, gameStateRef.current)
      drawIdleScreen(ctx)
      // Animate idle screen
      let idleAnim
      const animateIdle = () => {
        if (gameStateRef.current.state !== 'idle') return
        const t = Date.now() / 1000
        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)
        drawScene(ctx, gameStateRef.current, 0.016)
        drawIdleScreen(ctx)
        idleAnim = requestAnimationFrame(animateIdle)
      }
      animateIdle()
      return () => { if (idleAnim) cancelAnimationFrame(idleAnim) }
    }
  }, [uiState])

  const handlePointerMove = (e) => {
    if (gameStateRef.current.state !== 'playing') return
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = CANVAS_W / rect.width
    pointerXRef.current = (e.clientX - rect.left) * scaleX
  }

  const handleTouchMove = (e) => {
    if (gameStateRef.current.state !== 'playing') return
    e.preventDefault()
    const rect = canvasRef.current.getBoundingClientRect()
    const scaleX = CANVAS_W / rect.width
    pointerXRef.current = (e.touches[0].clientX - rect.left) * scaleX
  }

  // Circular timer percentage
  const timerPct = uiTimeLeft / GAME_TIME

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
      <div style={{ position: 'relative', width: '100%', maxWidth: '360px' }}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className="game-canvas"
          style={{ width: '100%', aspectRatio: `${CANVAS_W}/${CANVAS_H}` }}
          onMouseMove={handlePointerMove}
          onTouchMove={handleTouchMove}
          onTouchStart={handleTouchMove}
        />
        {/* Registering overlay on canvas */}
        {isRegistering && (
          <div className="registering-overlay">
            <span className="spinner" style={{ borderTopColor: '#5cc6e8', width: 32, height: 32 }} />
            <span style={{ fontSize: '0.95rem' }}>Registrando partida…</span>
            <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>Confirma la transacción en tu billetera</span>
          </div>
        )}
      </div>

      {/* HUD below canvas for active game */}
      {uiState === 'playing' && (
        <div style={{
          display: 'flex',
          gap: '1.5rem',
          alignItems: 'center',
          justifyContent: 'center',
          width: '100%',
          maxWidth: '360px',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'linear-gradient(135deg, var(--blue-soft), rgba(76, 184, 224, 0.1))',
            padding: '0.5rem 1rem',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(76, 184, 224, 0.2)',
          }}>
            <span style={{ fontSize: '1.1rem' }}>💧</span>
            <span style={{ fontWeight: 800, color: 'var(--blue-deep)', fontSize: '1.05rem' }}>
              {uiCaught}/{DROPS_TO_WIN}
            </span>
          </div>
          {/* Circular timer */}
          <div style={{ position: 'relative', width: 44, height: 44 }}>
            <svg width="44" height="44" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="22" cy="22" r="18" fill="none" stroke="#e0eee8" strokeWidth="4" />
              <circle
                cx="22" cy="22" r="18" fill="none"
                stroke={uiTimeLeft <= 5 ? 'var(--danger)' : 'var(--water)'}
                strokeWidth="4"
                strokeLinecap="round"
                strokeDasharray={2 * Math.PI * 18}
                strokeDashoffset={2 * Math.PI * 18 * (1 - timerPct)}
                style={{ transition: 'stroke-dashoffset 0.3s linear' }}
              />
            </svg>
            <span style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              fontWeight: 800,
              fontSize: '0.8rem',
              color: uiTimeLeft <= 5 ? 'var(--danger)' : 'var(--blue-deep)',
            }}>
              {uiTimeLeft}s
            </span>
          </div>
        </div>
      )}

      {uiState === 'idle' && (
        <button
          className="btn-water soft-pulse"
          onClick={startGame}
          disabled={disabled}
          style={{ fontSize: '1.1rem', padding: '0.85rem 2rem' }}
        >
          {disabled ? '⚠️ Conecta tu billetera primero' : '🎮 Jugar'}
        </button>
      )}

      {uiState === 'won' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '0.85rem',
          alignItems: 'center',
          animation: 'countUp 0.5s ease',
        }}>
          <div style={{
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            {isRegistering && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                background: 'var(--blue-soft)',
                padding: '0.5rem 1rem',
                borderRadius: 'var(--radius-md)',
                fontWeight: 700,
                color: 'var(--blue-deep)',
                fontSize: '0.9rem',
              }}>
                <span className="spinner" style={{ borderTopColor: 'var(--blue-mid)' }} />
                Registrando…
              </div>
            )}
            <button className="btn-secondary" onClick={resetGame}>🔁 Jugar de nuevo</button>
          </div>
        </div>
      )}

      {uiState === 'lost' && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.6rem',
          animation: 'countUp 0.5s ease',
        }}>
          <p style={{ color: 'var(--text-mid)', fontWeight: 600, fontSize: '0.9rem', textAlign: 'center' }}>
            ¡Casi lo logras! Inténtalo otra vez 💪
          </p>
          <button
            className="btn-water"
            onClick={startGame}
            disabled={disabled}
            style={{ fontSize: '1.05rem', padding: '0.7rem 1.8rem' }}
          >
            🔄 Intentar de nuevo
          </button>
        </div>
      )}
    </div>
  )
}

export default WaterGame
