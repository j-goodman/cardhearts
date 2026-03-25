const GAME_OVER_PALETTES = [
	{ base: "#3a2d27", stroke: "#b18866", accent: "#5b3f31", blockA: "#684a39", blockB: "#523a2f" },
	{ base: "#3a2b32", stroke: "#a27a84", accent: "#5a3f49", blockA: "#684b56", blockB: "#523a44" },
	{ base: "#343024", stroke: "#9b9160", accent: "#4f452f", blockA: "#5d5437", blockB: "#4a422d" },
	{ base: "#2d2f3a", stroke: "#7a84a2", accent: "#3f455a", blockA: "#4b5368", blockB: "#3a4052" }
]

const OPPONENT_FRAME_PALETTES = [
	{ base: "#3a2d27", stroke: "#b18866", accent: "#5b3f31", blockA: "#684a39", blockB: "#523a2f" },
	{ base: "#3a2b32", stroke: "#a27a84", accent: "#5a3f49", blockA: "#684b56", blockB: "#523a44" },
	{ base: "#343024", stroke: "#9b9160", accent: "#4f452f", blockA: "#5d5437", blockB: "#4a422d" }
]

const backgroundGradientCache = {
	width: 0,
	height: 0,
	gradient: null
}

const PERF_LOG_INTERVAL_MS = 2000
const perfMonitor = {
	enabled: (() => {
		try {
			return new URLSearchParams(window.location.search).get("perf") === "1" || window.__CARDHEARTS_PERF__ === true
		} catch {
			return false
		}
	})(),
	lastReportAt: 0,
	frameCount: 0,
	totalFrameMs: 0,
	totalUpdateMs: 0,
	totalDrawMs: 0,
	slowFrames: 0,
	slowFrameThresholdMs: 34
}

const reportPerfIfNeeded = (now, frameMs, updateMs, drawMs) => {
	if (!perfMonitor.enabled) {
		return
	}

	if (!perfMonitor.lastReportAt) {
		perfMonitor.lastReportAt = now
	}

	perfMonitor.frameCount += 1
	perfMonitor.totalFrameMs += frameMs
	perfMonitor.totalUpdateMs += updateMs
	perfMonitor.totalDrawMs += drawMs
	if (frameMs > perfMonitor.slowFrameThresholdMs) {
		perfMonitor.slowFrames += 1
	}

	const elapsed = now - perfMonitor.lastReportAt
	if (elapsed < PERF_LOG_INTERVAL_MS) {
		return
	}

	const frames = Math.max(1, perfMonitor.frameCount)
	const fps = (frames * 1000) / Math.max(1, elapsed)
	const avgFrameMs = perfMonitor.totalFrameMs / frames
	const avgUpdateMs = perfMonitor.totalUpdateMs / frames
	const avgDrawMs = perfMonitor.totalDrawMs / frames
	console.log(
		`[perf] fps=${fps.toFixed(1)} frame=${avgFrameMs.toFixed(2)}ms update=${avgUpdateMs.toFixed(2)}ms draw=${avgDrawMs.toFixed(2)}ms slow>${perfMonitor.slowFrameThresholdMs}ms=${perfMonitor.slowFrames}`
	)

	perfMonitor.lastReportAt = now
	perfMonitor.frameCount = 0
	perfMonitor.totalFrameMs = 0
	perfMonitor.totalUpdateMs = 0
	perfMonitor.totalDrawMs = 0
	perfMonitor.slowFrames = 0
}

const getBackgroundGradient = () => {
	const width = canvas.clientWidth
	const height = canvas.clientHeight
	if (!backgroundGradientCache.gradient || backgroundGradientCache.width !== width || backgroundGradientCache.height !== height) {
		const gradient = ctx.createLinearGradient(0, 0, 0, height)
		gradient.addColorStop(0, "#4a3934")
		gradient.addColorStop(1, "#211816")
		backgroundGradientCache.width = width
		backgroundGradientCache.height = height
		backgroundGradientCache.gradient = gradient
	}
	return backgroundGradientCache.gradient
}

const updateTableCardAnimations = ( ) => {
	for (const play of state.tablePlays) {
		const posEase = play.collecting ? 0.10 : 0.18
	play.x += (play.targetX - play.x) * posEase
	play.y += (play.targetY - play.y) * posEase
	play.angle += (play.targetAngle - play.angle) * (play.collecting ? 0.15 : 0.10)
	if (play.flipT < 1.0) {
			play.flipT = Math.min(1.0, play.flipT + 0.065)
	}
	}
}

const collectionExitForPlayer = (winnerIndex, cardW, cardH) => {
	const cw = canvas.clientWidth
	const ch = canvas.clientHeight
	const side = playerScreenSide(winnerIndex)
	if (side === "bottom") return { x: cw / 2 - cardW / 2, y: ch + cardH * 2 }
	if (side === "left") return { x: -cardW * 3, y: ch * 0.48 }
	if (side === "top") return { x: cw / 2 - cardW / 2, y: -cardH * 3 }
	return { x: cw + cardW * 2, y: ch * 0.48 }}

const startTrickCollect = (winnerIndex, now) => {
	const ref = state.tablePlays[0]
	const cardW = ref ? ref.w : 80
	const cardH = ref ? ref.h : 110
	const exit = collectionExitForPlayer(winnerIndex, cardW, cardH)
	for (const play of state.tablePlays) {
		play.collecting = true
	play.targetX = exit.x + (Math.random() - 0.5) * 55
	play.targetY = exit.y + (Math.random() - 0.5) * 55
	play.targetAngle = (Math.random() - 0.5) * 1.5
	}
	state.trickCollecting = true
	state.trickCollectWinnerIndex = winnerIndex
	state.trickCollectDoneAt = now + 860
}

const advanceTrick = (now ) => {
	const winnerIndex = state.trickCollectWinnerIndex
	state.trickCollecting = false
	state.trickCollectWinnerIndex = -1
	state.trickCollectDoneAt = 0
	state.tablePlays = []
	state.leadSuit = null
	state.leaderIndex = winnerIndex
	state.currentTurn = winnerIndex
	state.trickNumber += 1
	state.trickResolveAt = 0
	if (state.trickNumber >= 13) {
		finishRound(now)
	return
	}
	if (state.currentTurn !== HUMAN_INDEX) {
		state.computerActAt = now + randomBetween(550, 1100)
	}
	updateTurnStatus()
}

const updateGame = (now ) => {
	updateOpponentFrameSprings()

	if (state.gameOver?.active) {
		updatePortraits(now)
		return
	}

	updatePortraits(now)
	updateTableCardAnimations()

	if (state.passTransfer.active) {
		const transferEnd = state.passTransfer.transferDuration
		const holdEnd = transferEnd + state.passTransfer.holdDuration
		const doneAt = holdEnd + state.passTransfer.dropDuration
		const elapsed = now - state.passTransfer.startAt
		if (elapsed >= doneAt) {
			state.players[HUMAN_INDEX].hand = state.passTransfer.finalHumanHand
			const firstLeader = state.players.findIndex((player) => player.hand.some((card) => card.suit === "clubs" && card.rank === "2"))
			state.passTransfer.active = false
			state.passTransfer.outgoingCards = []
			state.passTransfer.incomingCards = []
			state.passTransfer.finalHumanHand = []
			state.currentTurn = firstLeader >= 0 ? firstLeader : 0
			state.leaderIndex = state.currentTurn
			state.roundInProgress = true
			state.computerActAt = now + randomBetween(450, 900)
			state.handLifts = new Array(state.players[HUMAN_INDEX].hand.length).fill(0)
			state.handFanProgress = 0
			state.handFanStartAt = now
			updateTurnStatus()
		}
	}

	if (!state.passPhase.active && !state.passTransfer.active && state.handFanProgress < 1) {
		if (!state.handFanStartAt) {
			state.handFanStartAt = now
		}
		const t = (now - state.handFanStartAt) / state.handFanDuration
		state.handFanProgress = Math.max(0, Math.min(1, t))
	}

	state.handDrop = 0
	if (state.heartsBreakOverlay.active) {
		const totalDuration = state.heartsBreakOverlay.riseDuration + state.heartsBreakOverlay.holdDuration
		if (now >= state.heartsBreakOverlay.startAt + totalDuration) {
			state.heartsBreakOverlay.active = false
		}
	}

	if (state.dealAnimation.active && now >= state.dealAnimation.completeAt) {
		finalizeDealtRound(now)
	}

	if (now < (state.actionPauseUntil || 0)) {
		return
	}

	if (!state.roundInProgress && state.roundRestartAt > 0 && now >= state.roundRestartAt) {
		dealRound(now)
	}

	if (!state.passTransfer.active && state.roundInProgress && state.currentTurn !== HUMAN_INDEX && state.currentTurn >= 0 && now >= state.computerActAt) {
		if (state.tablePlays.length < PLAYER_COUNT) {
			const computerCard = chooseComputerCardIndex(state.currentTurn)
			playCard(state.currentTurn, computerCard, now)
		}
	}

	if (state.roundInProgress && state.trickResolveAt > 0 && now >= state.trickResolveAt) {
		resolveTrick(now)
	}

	if (state.trickCollecting && state.trickCollectDoneAt > 0 && now >= state.trickCollectDoneAt) {
		advanceTrick(now)
	}
}

const rankLabel = (rank) => {
	if (rank === 1) return "1st"
	if (rank === 2) return "2nd"
	if (rank === 3) return "3rd"
	return `${rank}th`
}

const drawGameOverRanking = () => {
	if (!state.gameOver?.active) {
		return
	}

	const ranking = Array.isArray(state.gameOver.ranking) ? state.gameOver.ranking : []
	if (ranking.length === 0) {
		return
	}

	ctx.save()
	ctx.fillStyle = "rgba(21, 16, 13, 0.75)"
	ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)

	const cw = canvas.clientWidth
	const ch = canvas.clientHeight

	const headerH = Math.max(44, Math.floor(ch * 0.09))
	const headerFontSize = Math.max(22, Math.floor(cw * 0.028))
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	ctx.fillStyle = "rgba(255,244,230,0.95)"
	ctx.font = `${headerFontSize}px "Avenir Next", sans-serif`
	ctx.fillText("Results", cw / 2, headerH / 2)

	const titleH = 36
	const frameW = Math.floor(cw * 0.205)
	const frameH = Math.floor(ch * 0.30)
	const gap = Math.max(12, Math.floor(cw * 0.016))
	const gridW = 2 * frameW + gap
	const gridX = Math.floor((cw - gridW) / 2)
	const gridY = headerH + Math.floor(ch * 0.03)

	for (let i = 0; i < Math.min(ranking.length, 4); i += 1) {
		const playerIndex = ranking[i]
		const player = state.players[playerIndex]
		if (!player) {
			continue
		}

		const rank = i + 1
		const col = i % 2
		const row = Math.floor(i / 2)
		const fx = gridX + col * (frameW + gap)
		const fy = gridY + row * (frameH + gap)
		const palette = GAME_OVER_PALETTES[i % GAME_OVER_PALETTES.length]
		const isHuman = playerIndex === HUMAN_INDEX

		ctx.save()
		ctx.translate(fx, fy)

		ctx.fillStyle = palette.base
		ctx.fillRect(0, 0, frameW, frameH)
		ctx.lineWidth = 1
		ctx.strokeStyle = palette.stroke
		ctx.beginPath()
		ctx.moveTo(0.5, frameH - 0.5)
		ctx.lineTo(0.5, 0.5)
		ctx.lineTo(frameW - 0.5, 0.5)
		ctx.lineTo(frameW - 0.5, frameH - 0.5)
		ctx.stroke()

		ctx.fillStyle = palette.blockA
		ctx.fillRect(0, 0, Math.floor(frameW * 0.18), frameH)
		ctx.fillStyle = palette.blockB
		ctx.fillRect(frameW - Math.floor(frameW * 0.14), 0, Math.floor(frameW * 0.14), frameH)

		ctx.fillStyle = palette.accent
		ctx.fillRect(0, 0, frameW, titleH)

		const nameFontSize = Math.max(11, Math.floor(frameW * 0.06))
		ctx.font = `${nameFontSize}px "Trebuchet MS", "Avenir Next", sans-serif`
		ctx.textBaseline = "middle"
		const displayName = isHuman ? "You" : player.name
		const badgeText = `${displayName}  ${rankLabel(rank)}`
		const namePadX = 10
		const namePadY = 7
		const nameRightX = frameW - 10
		const nameY = 6
		const textW = Math.ceil(ctx.measureText(badgeText).width)
		ctx.fillStyle = "#4f382d"
		ctx.fillRect(nameRightX - textW - namePadX * 2, nameY, textW + namePadX * 2, nameFontSize + namePadY * 2)
		ctx.fillStyle = "#ffffff"
		ctx.fillText(badgeText, nameRightX - textW - namePadX, nameY + namePadY + nameFontSize / 2)

		ctx.textAlign = "left"
		ctx.fillStyle = "rgba(255, 244, 230, 0.85)"
		ctx.fillText(`${player.totalPoints} pts`, 10, titleH / 2)
		ctx.textAlign = "left"
		ctx.textBaseline = "alphabetic"

		const innerPad = 10
		const innerX = innerPad
		const innerY = titleH + innerPad
		const innerW = frameW - innerPad * 2
		const innerH = frameH - innerY - innerPad

		ctx.fillStyle = palette.blockB
		ctx.fillRect(innerX, innerY, innerW, innerH)
		ctx.lineWidth = 1
		ctx.strokeStyle = palette.stroke
		ctx.beginPath()
		ctx.moveTo(innerX + 0.5, innerY + innerH - 0.5)
		ctx.lineTo(innerX + 0.5, innerY + 0.5)
		ctx.lineTo(innerX + innerW - 0.5, innerY + 0.5)
		ctx.lineTo(innerX + innerW - 0.5, innerY + innerH - 0.5)
		ctx.stroke()

		ctx.fillStyle = player.color || "#7d8a63"
		ctx.fillRect(innerX, innerY, innerW, innerH)

		if (!isHuman) {
			const playerImgs = state.characterImages[player.name] || {}
			const portrait = playerImgs[player.portrait] || playerImgs.default
			if (portrait) {
				const maxImgW = innerW * 0.92
				const maxImgH = innerH * 0.96
				const pScale = Math.min(maxImgW / portrait.width, maxImgH / portrait.height)
				const imgW = portrait.width * pScale
				const imgH = portrait.height * pScale
				const portraitShift = innerW * 0.06
				const offsetX = (player.name === "Ron" || player.name === "Mitch") ? -portraitShift
					: (player.name === "Deena" ? portraitShift : 0)
				const imgX = innerX + (innerW - imgW) / 2 + offsetX
				const imgY = innerY + innerH - imgH
				ctx.imageSmoothingEnabled = false
				if (player.name === "Deena") {
					ctx.save()
					ctx.translate(Math.floor(imgX + imgW / 2), 0)
					ctx.scale(-1, 1)
					ctx.drawImage(portrait, Math.floor(-imgW / 2), Math.floor(imgY), Math.floor(imgW), Math.floor(imgH))
					ctx.restore()
				} else {
					ctx.drawImage(portrait, Math.floor(imgX), Math.floor(imgY), Math.floor(imgW), Math.floor(imgH))
				}
				ctx.imageSmoothingEnabled = true
			}
		}

		ctx.restore()
	}

	ctx.restore()
}

const drawDealAnimation = (now ) => {
	if (!state.dealAnimation.active) {
		return
	}

	const anim = state.dealAnimation
	const cardW = anim.cardW
	const cardH = anim.cardH
	const centerX = anim.centerX
	const centerY = anim.centerY
	const elapsed = now - anim.dealStartAt
	const enterT = Math.max(0, Math.min(1, elapsed / anim.enterDuration))
	const easedEnter = 1 - (1 - enterT) * (1 - enterT)
	const stackStartY = canvas.clientHeight + cardH * 0.4
	const stackY = stackStartY + (centerY - stackStartY) * easedEnter
	const flightElapsed = elapsed - anim.enterDuration - anim.pauseDuration
	const flightT = flightElapsed <= 0
		? 0
		: Math.max(0, Math.min(1, flightElapsed / anim.flightDuration))
	ctx.save()
	if (state.cardBackImage) {
		if (flightT <= 0) {
			for (let s = 0; s < 5; s += 1) {
				ctx.save()
	ctx.shadowColor = "rgba(0,0,0,0.28)"
	ctx.shadowBlur = 6
	ctx.shadowOffsetY = 2
	ctx.drawImage(state.cardBackImage, centerX + s * 0.35, stackY + s * 0.2, cardW, cardH)
	ctx.restore()
	}
		}

		for (const burst of anim.bursts) {
			const x = centerX + (burst.targetX - centerX) * flightT
	const y = stackY + (burst.targetY - centerY) * flightT
	ctx.save()
	ctx.shadowColor = "rgba(0,0,0,0.34)"
	ctx.shadowBlur = 8
	ctx.shadowOffsetY = 3
	ctx.drawImage(state.cardBackImage, x, y, cardW, cardH)
	ctx.restore()
	}
	}
	ctx.restore()
}

const drawTable = ( ) => {
	const w = canvas.clientWidth
	const h = canvas.clientHeight
	const topInset = w * 0.2
	const bottomInset = w * 0.06
	const topY = h * 0.21
	const bottomY = h * 0.91
	const frontBottomY = h
	const frontBottomInset = Math.min(w * 0.11, bottomInset + w * 0.03)
	ctx.save()
	ctx.beginPath()
	ctx.moveTo(topInset, topY)
	ctx.lineTo(w - topInset, topY)
	ctx.lineTo(w - bottomInset, bottomY)
	ctx.lineTo(bottomInset, bottomY)
	ctx.closePath()
	ctx.fillStyle = "#6f6441"
	ctx.fill()
	ctx.beginPath()
	ctx.moveTo(bottomInset, bottomY)
	ctx.lineTo(w - bottomInset, bottomY)
	ctx.lineTo(w - frontBottomInset, frontBottomY)
	ctx.lineTo(frontBottomInset, frontBottomY)
	ctx.closePath()
	ctx.fillStyle = "#4f442f"
	ctx.fill()
	ctx.restore()
}

const drawOpponentFrames = ( ) => {
	const w = canvas.clientWidth
	const h = canvas.clientHeight
	for (let i = 0; i < state.opponentFrames.length; i += 1) {
		const frame = state.opponentFrames[i]
	const player = state.players[frame.playerIndex]
	const palette = OPPONENT_FRAME_PALETTES[i % OPPONENT_FRAME_PALETTES.length]
	const rect = frameRect(frame)
	const x = rect.x
	const y = rect.y
	const fw = rect.w
	const fh = rect.h
	const titleH = rect.titleH
	const frameW = Math.floor(fw)
	const frameH = Math.floor(fh)
	const toggle = frameToggleRect(frame)
		ctx.save()
	ctx.translate(Math.floor(x), Math.floor(y))
		ctx.fillStyle = palette.base
	ctx.fillRect(0, 0, frameW, frameH)
	ctx.lineWidth = 1
	ctx.strokeStyle = palette.stroke
	ctx.beginPath()
	ctx.moveTo(0.5, frameH - 0.5)
	ctx.lineTo(0.5, 0.5)
	ctx.lineTo(frameW - 0.5, 0.5)
	ctx.lineTo(frameW - 0.5, frameH - 0.5)
	ctx.stroke()
		ctx.fillStyle = palette.blockA
	ctx.fillRect(0, 0, Math.floor(frameW * 0.18), frameH)
	ctx.fillStyle = palette.blockB
	ctx.fillRect(frameW - Math.floor(frameW * 0.14), 0, Math.floor(frameW * 0.14), frameH)
		ctx.fillStyle = palette.accent
	ctx.fillRect(0, 0, frameW, titleH)
		const nameFontSize = Math.max(11, Math.floor(fw * 0.06))
	ctx.font = `${nameFontSize}px "Trebuchet MS", "Avenir Next", sans-serif`
	ctx.textBaseline = "middle"
	const namePadX = 10
	const namePadY = 7
	const nameX = 10
	const nameY = 6
	const textW = Math.ceil(ctx.measureText(player.name).width)
	ctx.fillStyle = "#4f382d"
	ctx.fillRect(nameX, nameY, textW + namePadX * 2, nameFontSize + namePadY * 2)
	ctx.fillStyle = "#ffffff"
	ctx.fillText(player.name, nameX + namePadX, nameY + namePadY + nameFontSize / 2)
		// Score right-aligned in title bar
		ctx.textAlign = "right"
	ctx.fillStyle = "rgba(255, 244, 230, 0.85)"
	const scoreText = player.roundPoints > 0
			? `${player.totalPoints} pts  (+${player.roundPoints})`
			: `${player.totalPoints} pts`
	ctx.fillText(scoreText, frameW - FRAME_TOGGLE_SIZE - 18, titleH / 2)
	ctx.fillStyle = "rgba(79, 56, 45, 0.95)"
	ctx.fillRect(toggle.x - x, toggle.y - y, toggle.w, toggle.h)
	ctx.font = `${Math.max(14, Math.floor(nameFontSize * 1.05))}px "Avenir Next", sans-serif`
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	ctx.fillStyle = "#ffffff"
	ctx.fillText(frame.collapsed ? "⛶" : "-", toggle.x - x + toggle.w / 2, toggle.y - y + toggle.h / 2 + (frame.collapsed ? 1 : -1))
	ctx.textAlign = "left"
	ctx.textBaseline = "alphabetic"
		if (frame.collapsed) {
			ctx.restore()
			continue
		}
		const innerX = 10
	const innerY = titleH + 10
	const innerW = frameW - 20
	const innerH = frameH - innerY - 10
		ctx.fillStyle = palette.blockB
	ctx.fillRect(innerX, innerY, innerW, innerH)
	ctx.lineWidth = 1
	ctx.strokeStyle = palette.stroke
	ctx.beginPath()
	ctx.moveTo(innerX + 0.5, innerY + innerH - 0.5)
	ctx.lineTo(innerX + 0.5, innerY + 0.5)
	ctx.lineTo(innerX + innerW - 0.5, innerY + 0.5)
	ctx.lineTo(innerX + innerW - 0.5, innerY + innerH - 0.5)
	ctx.stroke()
		ctx.fillStyle = palette.blockA
	ctx.fillRect(innerX + 8, innerY + 8, Math.floor(innerW * 0.26), Math.floor(innerH * 0.26))
	ctx.fillStyle = player.color
	ctx.fillRect(innerX, innerY, innerW, innerH)
		const playerImgs = state.characterImages[player.name] || {}
		const portrait = playerImgs[player.portrait] || playerImgs.default
	if (portrait) {
			const maxImgW = innerW * 0.92
	const maxImgH = innerH * 0.96
	const scale = Math.min(maxImgW / portrait.width, maxImgH / portrait.height)
	const imgW = portrait.width * scale
	const imgH = portrait.height * scale
	const portraitShift = innerW * 0.06
	const offsetX = (player.name === "Ron" || player.name === "Mitch")
				? -portraitShift
				: (player.name === "Deena" ? portraitShift : 0)
	const imgX = innerX + (innerW - imgW) / 2 + offsetX
	const imgY = innerY + innerH - imgH
	ctx.imageSmoothingEnabled = false
	if (player.name === "Deena") {
				ctx.save()
	ctx.translate(Math.floor(imgX + imgW / 2), 0)
	ctx.scale(-1, 1)
	ctx.drawImage(portrait, Math.floor(-imgW / 2), Math.floor(imgY), Math.floor(imgW), Math.floor(imgH))
	ctx.restore()
	} else {
				ctx.drawImage(portrait, Math.floor(imgX), Math.floor(imgY), Math.floor(imgW), Math.floor(imgH))
	}
			ctx.imageSmoothingEnabled = true
	}

		ctx.restore()
	}
}

const drawPlayedCards = ( ) => {
	for (const play of state.tablePlays) {
		const flipT = play.flipT !== undefined ? play.flipT : 1.0
	const scaleX = flipT < 0.5 ? 1 - flipT * 2 : (flipT - 0.5) * 2
	if (scaleX < 0.005) continue
	const showFront = flipT >= 0.5
	const cx = play.x + play.w / 2
	const cy = play.y + play.h / 2
	ctx.save()
	ctx.shadowColor = "rgba(0,0,0,0.38)"
	ctx.shadowBlur = 12
	ctx.shadowOffsetY = 5
	ctx.translate(cx, cy)
	ctx.rotate(play.angle || 0)
	ctx.scale(scaleX, 1)
	const img = showFront ? play.card.img : state.cardBackImage
	if (img) {
			ctx.drawImage(img, -play.w / 2, -play.h / 2, play.w, play.h)
	}
		ctx.restore()
	}
}

const drawHand = ( ) => {
	if (state.dealAnimation.active) {
		canvas.style.cursor = "default"
	return
	}

	if (state.gameConfig.awaitingModeSelection) {
		canvas.style.cursor = "default"
		return
	}

	const hand = state.players[HUMAN_INDEX].hand
	const targetLayout = handLayout(hand.length, state.handFanProgress)
	if (hand.length === 0) {
		state.handVisualById = {}
	state.handVisualLayout = []
	}

	const nextVisualById = {}
	const visualLayout = []
	for (let i = 0; i < hand.length; i += 1) {
		const card = hand[i]
	const target = targetLayout[i]
	const prev = state.handVisualById[card.id] || {
			x: target.x,
			y: target.y,
			w: target.w,
			h: target.h,
			angle: target.angle
		}
	prev.x += (target.x - prev.x) * 0.24
	prev.y += (target.y - prev.y) * 0.24
	prev.w += (target.w - prev.w) * 0.24
	prev.h += (target.h - prev.h) * 0.24
	prev.angle += (target.angle - prev.angle) * 0.2
	nextVisualById[card.id] = prev
	visualLayout.push({ x: prev.x, y: prev.y, w: prev.w, h: prev.h, angle: prev.angle })
	}
	state.handVisualById = nextVisualById
	state.handVisualLayout = visualLayout
	if (state.handLifts.length !== visualLayout.length) {
		state.handLifts = new Array(visualLayout.length).fill(0)
	}

	state.activeHandIndex = state.pointer.active ? getHoveredCard(visualLayout) : -1
	const frameHover = state.pointer.active ? interactiveFrameAtPoint(state.pointer.x, state.pointer.y) : null
	const isHumanTurn = state.roundInProgress && state.currentTurn === HUMAN_INDEX
	const isPassing = state.passPhase.active
	const legalSet = isHumanTurn ? new Set(legalCardIndices(HUMAN_INDEX)) : new Set()
	const soloLegal = isHumanTurn && legalSet.size === 1
	const selectedSet = new Set(state.passPhase.humanSelected)
	const hoveredLegal = (isHumanTurn && state.activeHandIndex >= 0 && legalSet.has(state.activeHandIndex)) || (isPassing && state.activeHandIndex >= 0)
	if (state.windowInteraction.dragPlayerIndex >= 0) {
		canvas.style.cursor = "grabbing"
	} else if (frameHover?.isToggle) {
		canvas.style.cursor = "pointer"
	} else if (frameHover) {
		canvas.style.cursor = "grab"
	} else {
		canvas.style.cursor = hoveredLegal ? "pointer" : "default"
	}
	for (let i = 0; i < visualLayout.length; i += 1) {
		const isHovered = i === state.activeHandIndex
	const isSelectedForPass = isPassing && selectedSet.has(i)
	const isSoloCard = soloLegal && legalSet.has(i)
	let targetLift = 0
	if (isPassing) {
			targetLift = isSelectedForPass ? 28 : (isHovered ? 14 : 0)
	} else if (isHumanTurn) {
			if (isSoloCard) {
				targetLift = isHovered ? 36 : 18
	} else {
				targetLift = isHovered ? (legalSet.has(i) ? 36 : 8) : 0
	}
		}
		state.handLifts[i] += (targetLift - state.handLifts[i]) * 0.11
	}

	for (let i = 0; i < visualLayout.length; i += 1) {
		const slot = visualLayout[i]
	const card = hand[i]
	const drawY = slot.y - state.handLifts[i]
	const cx = slot.x + slot.w / 2
	const cy = drawY + slot.h / 2
		ctx.save()
	ctx.translate(cx, cy)
	ctx.rotate(slot.angle)
	ctx.shadowColor = "rgba(0,0,0,0.35)"
	ctx.shadowBlur = 10
	ctx.shadowOffsetY = 4
	if (card && card.img) {
			ctx.drawImage(card.img, -slot.w / 2, -slot.h / 2, slot.w, slot.h)
	} else if (state.cardBackImage) {
			ctx.drawImage(state.cardBackImage, -slot.w / 2, -slot.h / 2, slot.w, slot.h)
	}
		ctx.restore()
	}
}

const drawPassTransfer = (now ) => {
	if (!state.passTransfer.active) {
		return
	}

	const anim = state.passTransfer
	const elapsed = now - anim.startAt
	const transferEnd = anim.transferDuration
	const holdEnd = transferEnd + anim.holdDuration
	const dropEnd = holdEnd + anim.dropDuration
	ctx.save()
	for (const card of anim.outgoingCards) {
		const t = Math.max(0, Math.min(1, elapsed / transferEnd))
	const eased = 1 - Math.pow(1 - t, 3)
	const x = quadraticPoint(card.startX, card.ctrlX, card.targetX, eased)
	const y = quadraticPoint(card.startY, card.ctrlY, card.targetY, eased)
	const angle = card.startAngle + (card.targetAngle - card.startAngle) * eased
	const flipT = t
	const scaleX = flipT < 0.5 ? 1 - flipT * 2 : (flipT - 0.5) * 2
	if (t >= 1 || scaleX < 0.01) {
			continue
	}
		const showFront = flipT < 0.5
	const drawImg = showFront ? card.img : state.cardBackImage
	if (!drawImg) {
			continue
	}
		ctx.save()
	ctx.translate(x + card.w / 2, y + card.h / 2)
	ctx.rotate(angle)
	ctx.scale(scaleX, 1)
	ctx.shadowColor = "rgba(0,0,0,0.35)"
	ctx.shadowBlur = 12
	ctx.shadowOffsetY = 5
	ctx.drawImage(drawImg, -card.w / 2, -card.h / 2, card.w, card.h)
	ctx.restore()
	}

	for (const card of anim.incomingCards) {
		let x = card.stagingX
	let y = card.stagingY
	let angle = card.stagingAngle
	let dropT = 0
	if (elapsed < transferEnd) {
			const t = Math.max(0, Math.min(1, elapsed / transferEnd))
	const eased = 1 - Math.pow(1 - t, 3)
	x = quadraticPoint(card.startX, card.ctrlX, card.stagingX, eased)
	y = quadraticPoint(card.startY, card.ctrlY, card.stagingY, eased)
	angle = card.startAngle + (card.stagingAngle - card.startAngle) * eased
	} else if (elapsed >= holdEnd) {
			dropT = Math.max(0, Math.min(1, (elapsed - holdEnd) / anim.dropDuration))
	const eased = dropT * dropT * (3 - 2 * dropT)
	x = quadraticPoint(card.stagingX, (card.stagingX + card.dropX) * 0.5, card.dropX, eased)
	y = quadraticPoint(card.stagingY, (card.stagingY + card.dropY) * 0.5 + 26, card.dropY, eased)
	angle = card.stagingAngle + (card.dropAngle - card.stagingAngle) * eased
	}

		if (!state.cardBackImage || elapsed >= dropEnd) {
			continue
	}

		// Flip from back to face-up during drop phase (begins at 25% through drop, completes at 85%)
		const flipProgress = Math.max(0, Math.min(1, (dropT - 0.25) / 0.6))
	const scaleX = flipProgress < 0.5 ? 1 - flipProgress * 2 : (flipProgress - 0.5) * 2
	if (scaleX < 0.005) {
			continue
	}
		const showFront = flipProgress >= 0.5
	const drawImg = (showFront && card.img) ? card.img : state.cardBackImage
	ctx.save()
	ctx.translate(x + card.w / 2, y + card.h / 2)
	ctx.rotate(angle)
	ctx.scale(scaleX, 1)
	ctx.shadowColor = "rgba(0,0,0,0.35)"
	ctx.shadowBlur = 12
	ctx.shadowOffsetY = 5
	ctx.drawImage(drawImg, -card.w / 2, -card.h / 2, card.w, card.h)
	ctx.restore()
	}

	ctx.restore()
}

const drawYouLabel = ( ) => {
	const humanPlayer = state.players[HUMAN_INDEX]
	const titleH = 36
	const fw = canvas.clientWidth * 0.24
	const barX = Math.floor(canvas.clientWidth * 0.04)
	const barW = Math.floor(fw)
	const barY = Math.floor(canvas.clientHeight - 16 - titleH)
	const accent = "#5b3f31"
	const stroke = "#b18866"
	ctx.save()
	ctx.translate(barX, barY)
	ctx.fillStyle = accent
	ctx.fillRect(0, 0, barW, titleH)
	ctx.lineWidth = 1
	ctx.strokeStyle = stroke
	ctx.beginPath()
	ctx.moveTo(0.5, titleH - 0.5)
	ctx.lineTo(0.5, 0.5)
	ctx.lineTo(barW - 0.5, 0.5)
	ctx.lineTo(barW - 0.5, titleH - 0.5)
	ctx.stroke()
	const nameFontSize = Math.max(11, Math.floor(fw * 0.06))
	ctx.font = `${nameFontSize}px "Trebuchet MS", "Avenir Next", sans-serif`
	ctx.textBaseline = "middle"
	const namePadX = 10
	const namePadY = 7
	const nameX = 10
	const nameY = 6
	const nameTextW = Math.ceil(ctx.measureText("You").width)
	ctx.fillStyle = "#4f382d"
	ctx.fillRect(nameX, nameY, nameTextW + namePadX * 2, nameFontSize + namePadY * 2)
	ctx.fillStyle = "#ffffff"
	ctx.fillText("You", nameX + namePadX, nameY + namePadY + nameFontSize / 2)
	ctx.textAlign = "right"
	ctx.fillStyle = "rgba(255, 244, 230, 0.85)"
	const scoreText = humanPlayer.roundPoints > 0
		? `${humanPlayer.totalPoints} pts  (+${humanPlayer.roundPoints})`
		: `${humanPlayer.totalPoints} pts`
	ctx.fillText(scoreText, barW - 10, titleH / 2)
	ctx.textAlign = "left"
	ctx.textBaseline = "alphabetic"
	ctx.restore()
}



const drawSuitIcons = ( ) => {
	const order = ["clubs", "diamonds", "spades", "hearts"]
	const iconSize = Math.max(30, Math.floor(canvas.clientWidth * 0.034 * 1.5))
	const gap = Math.max(10, Math.floor(iconSize * 0.34))
	const totalW = iconSize * order.length + gap * (order.length - 1)
	const startX = canvas.clientWidth - totalW - 24
	const y = 12
	for (let i = 0; i < order.length; i += 1) {
		const suit = order[i]
	const key = suit === "hearts" && state.heartsBroken ? "brokenHearts" : suit
	const img = state.suitIcons[key]
	if (!img) {
			continue
	}
		const isActive = state.leadSuit === suit
	const iconX = startX + i * (iconSize + gap)
		ctx.save()
	if (isActive) {
			const frame = state.suitIcons.frame
	if (frame) {
				ctx.drawImage(frame, iconX - 8, y - 7, iconSize + 16, iconSize + 14)
	}
			ctx.shadowColor = "rgba(0,0,0,0.4)"
	ctx.shadowBlur = 10
	ctx.shadowOffsetY = 2
	}
		ctx.globalAlpha = 1
	ctx.drawImage(img, iconX, y, iconSize, iconSize)
	ctx.restore()
	}
}

const drawHeartsBrokenOverlay = (now ) => {
	if (!state.heartsBreakOverlay.active) {
		return
	}

	const overlay = state.heartsBreakOverlay
	const heartImg = state.suitIcons.hearts
	const brokenHeartImg = state.suitIcons.brokenHearts
	if (!heartImg || !brokenHeartImg) {
		return
	}

	const elapsed = now - overlay.startAt
	const riseDuration = overlay.riseDuration
	const holdEnd = riseDuration + overlay.holdDuration
	const totalDuration = holdEnd
	if (elapsed >= totalDuration) {
		return
	}

	const cw = canvas.clientWidth
	const ch = canvas.clientHeight
	const maxSize = Math.max(120, Math.min(220, cw * 0.17))
	const progress = Math.max(0, Math.min(1, elapsed / riseDuration))
	const eased = 1 - Math.pow(1 - progress, 4)
	const scale = elapsed < riseDuration ? 0.88 + eased * 0.18 : 1.06
	const size = maxSize * scale
	const baseX = cw / 2 - size / 2
	const yOffset = overlay.floatOffset * (1 - eased)
	const baseY = ch / 2 - size / 2 + 10 + yOffset
	const img = elapsed < riseDuration ? heartImg : brokenHeartImg
	ctx.save()
	ctx.globalAlpha = 1
	ctx.shadowColor = "rgba(0,0,0,0.28)"
	ctx.shadowBlur = 16
	ctx.shadowOffsetY = 4
	ctx.drawImage(img, baseX, baseY, size, size)
	ctx.restore()
}

const drawPassPrompt = ( ) => {
	if (!state.passPhase.active) {
		return
	}

	const direction = state.passPhase.direction
	const arrow = state.uiImages.rightArrow
	const centerX = canvas.clientWidth * 0.5
	const y = canvas.clientHeight * 0.5
	const selectedCount = state.passPhase.humanSelected.length
	const remaining = Math.max(0, 3 - selectedCount)
	const labelDirection = direction === "center" ? "CENTER" : direction.toUpperCase()
	let prompt = `Passing cards ${labelDirection}...`
	if (remaining === 3) {
		prompt = `Choose 3 cards to pass ${labelDirection}`
	} else if (remaining === 2) {
		prompt = `Choose 2 more cards to pass ${labelDirection}`
	} else if (remaining === 1) {
		prompt = `Choose 1 more card to pass ${labelDirection}`
	}

	ctx.save()
	ctx.font = `${Math.max(13, Math.floor(canvas.clientWidth * 0.014))}px "Avenir Next", sans-serif`
	ctx.textAlign = "center"
	ctx.textBaseline = "middle"
	ctx.fillStyle = "rgba(255, 244, 230, 0.95)"
	ctx.fillText(prompt, centerX, y)
	if (arrow) {
		const arrowSize = Math.max(42, Math.floor(canvas.clientWidth * 0.05))
	let rotation = 0
	let flipX = 1
	if (direction === "left") flipX = -1
	if (direction === "center") rotation = -Math.PI / 2
	ctx.translate(centerX, y + 44)
	ctx.rotate(rotation)
	ctx.scale(flipX, 1)
	ctx.globalAlpha = 0.95
	ctx.drawImage(arrow, -arrowSize / 2, -arrowSize / 2, arrowSize, arrowSize)
	}
	ctx.restore()
}

const render = (now = 0) => {
	const frameStart = performance.now()

	if (!state.lastNow) {
		state.lastNow = now
	}

	const updateStart = performance.now()
	updateGame(now)
	updateHeartBranding()
	const updateEnd = performance.now()

	ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
	ctx.fillStyle = getBackgroundGradient()
	ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
	const drawStart = performance.now()

	if (state.gameOver?.active) {
		drawGameOverRanking()
		const drawEnd = performance.now()
		reportPerfIfNeeded(now, drawEnd - frameStart, updateEnd - updateStart, drawEnd - drawStart)
		state.lastNow = now
		requestAnimationFrame(render)
		return
	}

	drawTable()
	drawDealAnimation(now)
	drawPlayedCards()
	drawPassTransfer(now)
	drawSuitIcons()
	drawOpponentFrames()
	drawYouLabel()
	drawHand()
	drawPassPrompt()
	drawHeartsBrokenOverlay(now)
	const drawEnd = performance.now()
	reportPerfIfNeeded(now, drawEnd - frameStart, updateEnd - updateStart, drawEnd - drawStart)
	state.lastNow = now
	requestAnimationFrame(render)
}

