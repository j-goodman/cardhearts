const canvas = document.getElementById("gameCanvas")
const ctx = canvas.getContext("2d")
const statusText = document.querySelector(".status-bar p")
const appIcon = document.querySelector(".app-icon")
const faviconLink = document.querySelector('link[rel="icon"]')
const modeSelectOverlay = document.querySelector(".mode-select-overlay")
const modeButtons = Array.from(document.querySelectorAll(".mode-button"))
const gameOverControls = document.querySelector(".game-over-controls")
const playAgainButton = document.querySelector(".play-again-button")
const switchModeButton = document.querySelector(".switch-mode-button")

const PLAYER_COUNT = 4
const HUMAN_INDEX = 0
const PASS_DIRECTIONS = ["left", "right", "center"]
const SHORT_GAME_SCORE = 50
const LONG_GAME_SCORE = 100
const FRAME_TITLE_HEIGHT = 36
const FRAME_TOGGLE_SIZE = 22
const FRAME_DRAG_LIMIT = 200
const FRAME_SNAP_LIMIT = 150
const DEFAULT_OPPONENT_FRAMES = [
	{ playerIndex: 2, x: 0.04, y: 0.31, w: 0.205, h: 0.30 },
	{ playerIndex: 1, x: 0.36, y: 0.05, w: 0.205, h: 0.30 },
	{ playerIndex: 3, x: 0.74, y: 0.27, w: 0.205, h: 0.30 }
]

const buildOpponentFrames = () => DEFAULT_OPPONENT_FRAMES.map((frame) => ({
	...frame,
	spawnX: frame.x,
	spawnY: frame.y,
	collapsed: false,
	springTargetX: null,
	springTargetY: null,
	springVelocityX: 0,
	springVelocityY: 0
}))

const state = {
	dpr: Math.max(1, window.devicePixelRatio || 1),
	pointer: { x: 0, y: 0, active: false },
	activeHandIndex: -1,
	handLifts: [],
	handVisualById: {},
	handVisualLayout: [],
	handFanProgress: 1,
	handFanStartAt: 0,
	handFanDuration: 380,
	handDrop: 0,
	handDropUntil: 0,
	players: [],
	deck: [],
	characterImages: {},
	uiImages: {},
	suitIcons: {},
	cardBackImage: null,
	currentTurn: 0,
	leaderIndex: 0,
	leadSuit: null,
	tablePlays: [],
	heartsBroken: false,
	trickNumber: 0,
	roundNumber: 1,
	roundInProgress: false,
	roundRestartAt: 0,
	actionPauseUntil: 0,
	computerActAt: 0,
	trickResolveAt: 0,
	trickCollecting: false,
	trickCollectWinnerIndex: -1,
	trickCollectDoneAt: 0,
	lastNow: 0,
	status: "",
	pendingRound: null,
	gameConfig: {
		targetScore: SHORT_GAME_SCORE,
		awaitingModeSelection: true
	},
	windowInteraction: {
		dragPlayerIndex: -1,
		pendingTogglePlayerIndex: -1,
		pointerOffsetX: 0,
		pointerOffsetY: 0,
		startPointerX: 0,
		startPointerY: 0,
		moved: false,
		suppressClick: false
	},
	passPhase: {
		active: false,
		direction: "left",
		humanSelected: []
	},
	passTransfer: {
		active: false,
		startAt: 0,
		transferDuration: 560,
		holdDuration: 200,
		dropDuration: 480,
		outgoingCards: [],
		incomingCards: [],
		finalHumanHand: []
	},
	heartsBreakOverlay: {
		active: false,
		startAt: 0,
		riseDuration: 420,
		holdDuration: 1800,
		flashDuration: 1800,
		floatOffset: 24
	},
	dealAnimation: {
		active: false,
		dealStartAt: 0,
		completeAt: 0,
		cardW: 0,
		cardH: 0,
		centerX: 0,
		centerY: 0,
		bursts: [],
		enterDuration: 240,
		pauseDuration: 240,
		flightDuration: 220
	},
	gameOver: {
		active: false,
		ranking: [],
		rankByPlayer: [],
		winnerIndex: -1,
		loserIndex: -1,
		startedAt: 0,
		winnerTauntAt: 0,
		winnerSmileAt: 0,
		loserFrownAt: 0,
		thirdDefaultAt: 0
	},
	opponentFrames: buildOpponentFrames()
}

const ensurePlayAgainButton = () => {
	if (playAgainButton && !playAgainButton.dataset.bound) {
		playAgainButton.addEventListener("click", () => {
			restartGameAfterGameOver()
		})
		playAgainButton.dataset.bound = "true"
	}
	return playAgainButton
}

const showPlayAgainButton = () => {
	ensurePlayAgainButton()
	updateSwitchModeButtonLabel()
	if (gameOverControls) {
		gameOverControls.hidden = false
	}
}

const hidePlayAgainButton = () => {
	if (gameOverControls) {
		gameOverControls.hidden = true
	}
}

const alternateTargetScore = (targetScore = state.gameConfig.targetScore) => {
	return targetScore === SHORT_GAME_SCORE ? LONG_GAME_SCORE : SHORT_GAME_SCORE
}

const gameModeName = (targetScore = state.gameConfig.targetScore) => {
	return targetScore === LONG_GAME_SCORE ? "long" : "short"
}

const updateSwitchModeButtonLabel = () => {
	if (!switchModeButton) {
		return
	}
	switchModeButton.textContent = `Switch to ${gameModeName(alternateTargetScore())} game`
}

const showModeSelectOverlay = () => {
	state.gameConfig.awaitingModeSelection = true
	hidePlayAgainButton()
	if (modeSelectOverlay) {
		modeSelectOverlay.hidden = false
	}
	// No status/caption
}

const hideModeSelectOverlay = () => {
	state.gameConfig.awaitingModeSelection = false
	if (modeSelectOverlay) {
		modeSelectOverlay.hidden = true
		modeSelectOverlay.classList.remove('bg-fade', 'expanding')
	}
}

const frameRect = (frame) => {
	const width = frame.w * canvas.clientWidth
	const expandedHeight = frame.h * canvas.clientHeight
	return {
		x: frame.x * canvas.clientWidth,
		y: frame.y * canvas.clientHeight,
		w: width,
		h: frame.collapsed ? FRAME_TITLE_HEIGHT : expandedHeight,
		expandedH: expandedHeight,
		titleH: FRAME_TITLE_HEIGHT
	}
}

const clamp = (value, min, max) => {
	return Math.min(max, Math.max(min, value))
}

const pointInRect = (x, y, rect) => {
	return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h
}

const frameToggleRect = (frame) => {
	const rect = frameRect(frame)
	return {
		x: rect.x + rect.w - FRAME_TOGGLE_SIZE - 8,
		y: rect.y + 7,
		w: FRAME_TOGGLE_SIZE,
		h: FRAME_TOGGLE_SIZE
	}
}

const interactiveFrameAtPoint = (x, y) => {
	for (let i = state.opponentFrames.length - 1; i >= 0; i -= 1) {
		const frame = state.opponentFrames[i]
		const rect = frameRect(frame)
		const titleRect = { x: rect.x, y: rect.y, w: rect.w, h: rect.titleH }
		if (!pointInRect(x, y, titleRect)) {
			continue
		}
		return {
			frame,
			isToggle: pointInRect(x, y, frameToggleRect(frame))
		}
	}
	return null
}

const updateDraggedFrame = () => {
	const dragPlayerIndex = state.windowInteraction.dragPlayerIndex
	if (dragPlayerIndex < 0) {
		return false
	}

	const frame = frameForPlayer(dragPlayerIndex)
	if (!frame) {
		return false
	}

	const newX = state.pointer.x - state.windowInteraction.pointerOffsetX
	const newY = state.pointer.y - state.windowInteraction.pointerOffsetY
	const minX = -frameRect(frame).w * 0.35
	const maxX = canvas.clientWidth - frameRect(frame).w * 0.65
	const minY = 0
	const maxY = canvas.clientHeight - FRAME_TITLE_HEIGHT
	frame.x = clamp(newX, minX, maxX) / canvas.clientWidth
	frame.y = clamp(newY, minY, maxY) / canvas.clientHeight
	frame.springTargetX = null
	frame.springTargetY = null
	frame.springVelocityX = 0
	frame.springVelocityY = 0

	const movedDistance = Math.hypot(
		state.pointer.x - state.windowInteraction.startPointerX,
		state.pointer.y - state.windowInteraction.startPointerY
	)
	if (movedDistance > 4) {
		state.windowInteraction.moved = true
	}
	return true
}

const settleDraggedFrame = () => {
	const dragPlayerIndex = state.windowInteraction.dragPlayerIndex
	if (dragPlayerIndex < 0) {
		return false
	}

	const frame = frameForPlayer(dragPlayerIndex)
	if (frame) {
		const dxPx = (frame.x - frame.spawnX) * canvas.clientWidth
		const dyPx = (frame.y - frame.spawnY) * canvas.clientHeight
		const distance = Math.hypot(dxPx, dyPx)
		if (distance > FRAME_DRAG_LIMIT) {
			const scale = FRAME_SNAP_LIMIT / distance
			frame.springTargetX = frame.spawnX + (dxPx * scale) / canvas.clientWidth
			frame.springTargetY = frame.spawnY + (dyPx * scale) / canvas.clientHeight
			frame.springVelocityX = dxPx === 0 ? 0 : (dxPx / canvas.clientWidth) * 0.02
			frame.springVelocityY = dyPx === 0 ? 0 : (dyPx / canvas.clientHeight) * 0.02
		}
	}

	state.windowInteraction.dragPlayerIndex = -1
	state.windowInteraction.pointerOffsetX = 0
	state.windowInteraction.pointerOffsetY = 0
	return true
}

const updateOpponentFrameSprings = () => {
	for (const frame of state.opponentFrames) {
		if (frame.playerIndex === state.windowInteraction.dragPlayerIndex) {
			continue
		}
		if (typeof frame.springTargetX !== "number" || typeof frame.springTargetY !== "number") {
			continue
		}

		const dx = frame.springTargetX - frame.x
		const dy = frame.springTargetY - frame.y
		frame.springVelocityX = (frame.springVelocityX + dx * 0.18) * 0.72
		frame.springVelocityY = (frame.springVelocityY + dy * 0.18) * 0.72
		frame.x += frame.springVelocityX
		frame.y += frame.springVelocityY

		const closeEnough =
			Math.abs(dx * canvas.clientWidth) < 0.5
			&& Math.abs(dy * canvas.clientHeight) < 0.5
			&& Math.abs(frame.springVelocityX * canvas.clientWidth) < 0.5
			&& Math.abs(frame.springVelocityY * canvas.clientHeight) < 0.5
		if (closeEnough) {
			frame.x = frame.springTargetX
			frame.y = frame.springTargetY
			frame.springTargetX = null
			frame.springTargetY = null
			frame.springVelocityX = 0
			frame.springVelocityY = 0
		}
	}
}

const handleFramePointerDown = () => {
	const hit = interactiveFrameAtPoint(state.pointer.x, state.pointer.y)
	if (!hit) {
		return false
	}

	state.windowInteraction.suppressClick = true
	state.windowInteraction.startPointerX = state.pointer.x
	state.windowInteraction.startPointerY = state.pointer.y
	state.windowInteraction.moved = false
	if (hit.isToggle) {
		state.windowInteraction.pendingTogglePlayerIndex = hit.frame.playerIndex
		return true
	}

	const rect = frameRect(hit.frame)
	state.windowInteraction.dragPlayerIndex = hit.frame.playerIndex
	state.windowInteraction.pointerOffsetX = state.pointer.x - rect.x
	state.windowInteraction.pointerOffsetY = state.pointer.y - rect.y
	return true
}

const handleFramePointerUp = () => {
	let handled = false
	if (state.windowInteraction.pendingTogglePlayerIndex >= 0) {
		const frame = frameForPlayer(state.windowInteraction.pendingTogglePlayerIndex)
		if (frame && pointInRect(state.pointer.x, state.pointer.y, frameToggleRect(frame))) {
			frame.collapsed = !frame.collapsed
		}
		state.windowInteraction.pendingTogglePlayerIndex = -1
		handled = true
	}
	if (settleDraggedFrame()) {
		handled = true
	}
	return handled
}

const resetWindowInteraction = () => {
	state.windowInteraction.dragPlayerIndex = -1
	state.windowInteraction.pendingTogglePlayerIndex = -1
	state.windowInteraction.pointerOffsetX = 0
	state.windowInteraction.pointerOffsetY = 0
	state.windowInteraction.startPointerX = 0
	state.windowInteraction.startPointerY = 0
	state.windowInteraction.moved = false
}

const resetGameState = (now = performance.now()) => {
	hidePlayAgainButton()
	resetWindowInteraction()

	state.gameOver.active = false
	state.gameOver.ranking = []
	state.gameOver.rankByPlayer = []
	state.gameOver.winnerIndex = -1
	state.gameOver.loserIndex = -1
	state.gameOver.startedAt = 0
	state.gameOver.winnerTauntAt = 0
	state.gameOver.winnerSmileAt = 0
	state.gameOver.loserFrownAt = 0
	state.gameOver.thirdDefaultAt = 0

	state.heartsBroken = false
	state.tablePlays = []
	state.leadSuit = null
	state.currentTurn = -1
	state.leaderIndex = 0
	state.trickNumber = 0
	state.roundNumber = 1
	state.roundInProgress = false
	state.roundRestartAt = 0
	state.actionPauseUntil = 0
	state.computerActAt = 0
	state.trickResolveAt = 0
	state.trickCollecting = false
	state.trickCollectWinnerIndex = -1
	state.trickCollectDoneAt = 0
	state.pendingRound = null
	state.passPhase.active = false
	state.passPhase.direction = "left"
	state.passPhase.humanSelected = []
	state.passTransfer.active = false
	state.passTransfer.outgoingCards = []
	state.passTransfer.incomingCards = []
	state.passTransfer.finalHumanHand = []
	state.heartsBreakOverlay.active = false
	state.dealAnimation.active = false
	state.dealAnimation.bursts = []
	state.activeHandIndex = -1
	state.handVisualById = {}
	state.handVisualLayout = []
	state.handLifts = []
	state.handFanProgress = 1
	state.handFanStartAt = 0

	for (const player of state.players) {
		player.hand = []
		player.taken = []
		player.roundPoints = 0
		player.totalPoints = 0
		scheduleNextIdle(player, now)
	}
}

const startGameWithTargetScore = (targetScore) => {
	state.gameConfig.targetScore = targetScore
	// Animate overlay: expand window, fade in background, then start game
	if (modeSelectOverlay) {
		modeSelectOverlay.classList.add('bg-fade')
		setTimeout(() => {
			modeSelectOverlay.classList.add('expanding')
			setTimeout(() => {
				hideModeSelectOverlay()
				resetGameState(performance.now())
				setStatus(`${gameModeName(targetScore)[0].toUpperCase()}${gameModeName(targetScore).slice(1)} game to ${targetScore} points. Dealing cards...`)
				dealRound(performance.now())
			}, 480) // match CSS .mode-select-window transition
		}, 60)
	} else {
		hideModeSelectOverlay()
		resetGameState(performance.now())
		setStatus(`${gameModeName(targetScore)[0].toUpperCase()}${gameModeName(targetScore).slice(1)} game to ${targetScore} points. Dealing cards...`)
		dealRound(performance.now())
	}
}

const beginGameOver = (now) => {
	const ranking = state.players
		.map((player, index) => ({ index, totalPoints: player.totalPoints }))
		.sort((a, b) => a.totalPoints - b.totalPoints)
		.map((item) => item.index)
	const rankByPlayer = new Array(state.players.length).fill(0)
	for (let i = 0; i < ranking.length; i += 1) {
		rankByPlayer[ranking[i]] = i + 1
	}

	const winnerIndex = ranking[0] ?? 0
	const loserIndex = ranking[ranking.length - 1] ?? 0

	state.gameOver.active = true
	state.gameOver.ranking = ranking
	state.gameOver.rankByPlayer = rankByPlayer
	state.gameOver.winnerIndex = winnerIndex
	state.gameOver.loserIndex = loserIndex
	state.gameOver.startedAt = now
	state.gameOver.winnerTauntAt = now + randomBetween(3000, 6000)
	state.gameOver.winnerSmileAt = state.gameOver.winnerTauntAt + 1500
	state.gameOver.loserFrownAt = now + randomBetween(5000, 10000)
	state.gameOver.thirdDefaultAt = now + randomBetween(7000, 15000)

	state.roundInProgress = false
	state.roundRestartAt = 0
	state.actionPauseUntil = 0
	state.currentTurn = -1
	state.passPhase.active = false
	state.passTransfer.active = false
	state.passPhase.humanSelected = []

	for (let i = 0; i < state.players.length; i += 1) {
		const player = state.players[i]
		const rank = rankByPlayer[i]
		if (rank === 1) {
			player.portrait = "laugh"
		} else if (rank === 3) {
			player.portrait = "frown"
		} else if (rank === 4) {
			player.portrait = "anguish"
		} else {
			player.portrait = "default"
		}
		player.portraitUntil = Number.POSITIVE_INFINITY
		player.pendingReaction = null
	}

	setStatus(`Game over at ${state.gameConfig.targetScore} points. Winner: ${state.players[winnerIndex]?.name || "-"}`)
	showPlayAgainButton()
}

const restartGameAfterGameOver = () => {
	resetGameState(performance.now())
	dealRound(performance.now())
}

const switchGameModeAfterGameOver = () => {
	state.gameConfig.targetScore = alternateTargetScore()
	restartGameAfterGameOver()
}
const setStatus = (text ) => {
	state.status = text
	if (statusText) {
		statusText.textContent = text
	}
}

const updateHeartBranding = ( ) => {
	const iconPath = state.heartsBroken ? "assets/broken-heart-icon.png" : "assets/heart-icon.png"
	if (appIcon && appIcon.getAttribute("src") !== iconPath) {
		appIcon.setAttribute("src", iconPath)
	}
	if (faviconLink && faviconLink.getAttribute("href") !== iconPath) {
		faviconLink.setAttribute("href", iconPath)
	}
}

const triggerHeartsBrokenOverlay = (now ) => {
	state.heartsBreakOverlay.active = true
	state.heartsBreakOverlay.startAt = now
	state.actionPauseUntil = Math.max(state.actionPauseUntil || 0, now + 1500)
}

const randomBetween = (min, max) => {
	return min + Math.random() * (max - min)
}

const randomItem = (list ) => {
	return list[Math.floor(Math.random() * list.length)]
}

const buildDeck = ( ) => {
	let id = 0
	const deck = []
	for (const suit of SUITS) {
		for (const rank of RANKS) {
			deck.push({
				id: id++,
				rank,
				suit,
				file: `assets/cards/${rank} of ${suit}.png`,
				img: null
			})
	}
	}
	return deck
}

const shuffle = (list ) => {
	for (let i = list.length - 1; i > 0; i -= 1) {
		const j = Math.floor(Math.random() * (i + 1))
		;[list[i], list[j]] = [list[j], list[i]]
	}
	return list
}

const sortHand = (cards ) => {
	return cards.slice().sort((a, b) => {
		const suitDiff = SUIT_SORT_ORDER[a.suit] - SUIT_SORT_ORDER[b.suit]
	if (suitDiff !== 0) {
			return suitDiff
	}
		return RANK_VALUE[a.rank] - RANK_VALUE[b.rank]
	})
}

const loadImage = (src ) => {
	return new Promise((resolve) => {
		const img = new Image()
	img.onload = () => resolve(img)
	img.onerror = () => resolve(null)
	img.src = src
	})
}

const resizeCanvas = ( ) => {
	const rect = canvas.getBoundingClientRect()
	const width = Math.floor(rect.width)
	const height = Math.floor(rect.height)
	canvas.width = Math.floor(width * state.dpr)
	canvas.height = Math.floor(height * state.dpr)
	ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0)
}

const handLayout = (cardCount, fanProgress = 1) => {
	const cw = canvas.clientWidth
	const ch = canvas.clientHeight
	const cardH = Math.min(230, ch * 0.35)
	const cardW = cardH * 0.72
	const fullSpread = Math.max(28, Math.min(54, cw * 0.034))
	const compactSpread = fullSpread * 0.78
	const spread = compactSpread + (fullSpread - compactSpread) * fanProgress
	const fanWidth = cardW + spread * (cardCount - 1)
	const baseX = Math.max(12, (cw - fanWidth) / 2)
	const baseY = ch - cardH - 14
	const centerIndex = (cardCount - 1) / 2
	return Array.from({ length: cardCount }, (_, i) => {
		const t = i - centerIndex
	return {
			x: baseX + i * spread,
			y: baseY,
			w: cardW,
			h: cardH,
			angle: t * 0.018 * fanProgress
		}
	})
}

const getHoveredCard = (layout ) => {
	for (let i = layout.length - 1; i >= 0; i -= 1) {
		const box = layout[i]
	const centerX = box.x + box.w / 2
	const centerY = box.y + box.h / 2
	const dx = state.pointer.x - centerX
	const dy = state.pointer.y - centerY
	const cos = Math.cos(-box.angle)
	const sin = Math.sin(-box.angle)
	const localX = dx * cos - dy * sin
	const localY = dx * sin + dy * cos
	if (Math.abs(localX) <= box.w / 2 && Math.abs(localY) <= box.h / 2) {
			return i
	}
	}
	return -1
}

const getHandInteractionLayout = (hand ) => {
	if (state.handVisualLayout.length === hand.length && hand.length > 0) {
		return state.handVisualLayout
	}
	return handLayout(hand.length, state.handFanProgress)
}

const cardPoints = (card ) => {
	if (card.suit === "hearts") {
		return 1
	}
	if (card.suit === "spades" && card.rank === "Q") {
		return 13
	}
	return 0
}

const recalculateRoundPointsFromTaken = () => {
	for (const player of state.players) {
		const takenCards = Array.isArray(player.taken) ? player.taken : []
		player.roundPoints = takenCards.reduce((sum, card) => sum + cardPoints(card), 0)
	}
}

const hasSuit = (cards, suit) => {
	return cards.some((card) => card.suit === suit)
}

const isPointCard = (card ) => {
	return card.suit === "hearts" || (card.suit === "spades" && card.rank === "Q")
}

const hasQueenOfSpadesBeenPlayed = () => {
	if (state.tablePlays.some((play) => play.card.suit === "spades" && play.card.rank === "Q")) {
		return true
	}
	return state.players.some((player) => player.taken.some((card) => card.suit === "spades" && card.rank === "Q"))
}

const legalCardIndices = (playerIndex ) => {
	const player = state.players[playerIndex]
	const cards = player.hand
	if (state.tablePlays.length === 0 && state.trickNumber === 0) {
		const twoClubsIndex = cards.findIndex((card) => card.suit === "clubs" && card.rank === "2")
	if (twoClubsIndex >= 0) {
			return [twoClubsIndex]
	}
	}

	if (state.leadSuit) {
		if (hasSuit(cards, state.leadSuit)) {
			const follow = []
	for (let i = 0; i < cards.length; i += 1) {
				if (cards[i].suit === state.leadSuit) {
					follow.push(i)
	}
			}
			return follow
	}

		if (state.trickNumber === 0) {
			const noPointCards = []
	for (let i = 0; i < cards.length; i += 1) {
				if (cards[i].suit !== "hearts" && !(cards[i].suit === "spades" && cards[i].rank === "Q")) {
					noPointCards.push(i)
	}
			}

			if (noPointCards.length > 0) {
				return noPointCards
			}

			const noQueenSpades = []
			for (let i = 0; i < cards.length; i += 1) {
				if (!(cards[i].suit === "spades" && cards[i].rank === "Q")) {
					noQueenSpades.push(i)
				}
			}

			return noQueenSpades.length > 0 ? noQueenSpades : cards.map((_, i) => i)
	}

		return cards.map((_, i) => i)
	}

	const hasNonHearts = cards.some((card) => card.suit !== "hearts")
	if (!state.heartsBroken && hasNonHearts) {
		const noHeartLead = []
	for (let i = 0; i < cards.length; i += 1) {
			if (cards[i].suit !== "hearts") {
				noHeartLead.push(i)
	}
		}
		return noHeartLead
	}

	return cards.map((_, i) => i)
}

const tableTargetForPlayer = (playerIndex, cardW, cardH) => {
	const cx = canvas.clientWidth / 2
	const ch = canvas.clientHeight
	const cy = ch * 0.42
	const side = playerScreenSide(playerIndex)
	if (side === "bottom") {
		const handCardH = Math.min(230, ch * 0.35)
		const handTop = ch - handCardH - 14
		const maxBottomY = handTop - cardH - Math.max(8, cardH * 0.08)
		const preferredY = cy + cardH * 0.22
		const bottomOffsetX = cardW * 0.2
		return { x: cx - cardW / 2 + bottomOffsetX, y: Math.min(preferredY, maxBottomY) }
	}
	if (side === "left") {
		return { x: cx - cardW * 2.1, y: cy - cardH * 0.08 }
	}
	if (side === "top") {
		const topFrame = frameForPlayer(playerIndex)
		const fallbackY = cy - cardH * 0.96
		const topOffsetX = -cardW * 0.2
		if (!topFrame) {
			return { x: cx - cardW / 2 + topOffsetX, y: fallbackY }
		}

		const topFrameBottom = frameRect(topFrame).y + frameRect(topFrame).h
		const clearanceY = topFrameBottom + Math.max(10, cardH * 0.1)
		return { x: cx - cardW / 2 + topOffsetX, y: Math.max(fallbackY, clearanceY) }
	}
	return { x: cx + cardW * 1.1, y: cy - cardH * 0.08 }}

const frameForPlayer = (playerIndex ) => {
	return state.opponentFrames.find((frame) => frame.playerIndex === playerIndex) || null
}

const playerScreenSide = (playerIndex ) => {
	if (playerIndex === HUMAN_INDEX) {
		return "bottom"
	}

	const frame = frameForPlayer(playerIndex)
	if (!frame) {
		if (playerIndex === 1) return "left"
	if (playerIndex === 2) return "top"
	return "right"
	}

	const rect = frameRect(frame)
	const centerX = (rect.x + rect.w / 2) / canvas.clientWidth
	const centerY = (rect.y + rect.h / 2) / canvas.clientHeight
	const distances = [
		{ side: "left", distance: centerX },
		{ side: "right", distance: 1 - centerX },
		{ side: "top", distance: centerY },
		{ side: "bottom", distance: 1 - centerY }
	]
	distances.sort((a, b) => a.distance - b.distance)
	return distances[0].side
}

const playerTablePosition = (playerIndex ) => {
	if (playerIndex === HUMAN_INDEX) {
		return { x: 0.5, y: 1.15 }
	}

	const frame = frameForPlayer(playerIndex)
	if (frame) {
		const rect = frameRect(frame)
		return {
			x: (rect.x + rect.w / 2) / canvas.clientWidth,
			y: (rect.y + rect.h / 2) / canvas.clientHeight
		}
	}

	const side = playerScreenSide(playerIndex)
	if (side === "left") return { x: -0.2, y: 0.5 }
	if (side === "top") return { x: 0.5, y: -0.2 }
	if (side === "right") return { x: 1.2, y: 0.5 }
	return { x: 0.5, y: 1.2 }
}

const clockwisePlayerOrder = ( ) => {
	const cx = 0.5
	const cy = 0.5
	const players = state.players.length > 0
		? state.players.map((_, index) => index)
		: Array.from({ length: PLAYER_COUNT }, (_, index) => index)

	const order = players.map((index) => {
		const position = playerTablePosition(index)
		return {
			index,
			angle: Math.atan2(position.y - cy, position.x - cx)
		}
	})

	order.sort((a, b) => a.angle - b.angle)
	return order.map((item) => item.index)
}

const nextClockwisePlayer = (playerIndex ) => {
	const order = clockwisePlayerOrder()
	const at = order.indexOf(playerIndex)
	if (at < 0) {
		return (playerIndex + 1) % PLAYER_COUNT
	}
	return order[(at + 1) % order.length]
}

const previousClockwisePlayer = (playerIndex ) => {
	const order = clockwisePlayerOrder()
	const at = order.indexOf(playerIndex)
	if (at < 0) {
		return (playerIndex + PLAYER_COUNT - 1) % PLAYER_COUNT
	}
	return order[(at + order.length - 1) % order.length]
}

const seatOriginForPlayer = (playerIndex, cardW, cardH, handIndex) => {
	if (playerIndex === HUMAN_INDEX) {
		const visualLayout = state.handVisualLayout
	const fallbackLayout = handLayout(state.players[HUMAN_INDEX].hand.length + 1, state.handFanProgress)
	const sourceLayout = visualLayout.length > 0 ? visualLayout : fallbackLayout
	const safeIndex = Math.min(handIndex, Math.max(0, sourceLayout.length - 1))
	const slot = sourceLayout[safeIndex] || { x: canvas.clientWidth / 2 - cardW / 2, y: canvas.clientHeight - cardH - 16 }
	const lift = state.handLifts[safeIndex] || 0
	return { x: slot.x, y: slot.y - lift }
	}

	const cw = canvas.clientWidth
	const ch = canvas.clientHeight
	const side = playerScreenSide(playerIndex)
	if (side === "left") {
		return { x: -cardW * 1.8, y: ch * 0.52 - cardH / 2 }
	}
	if (side === "top") {
		return { x: cw * 0.5 - cardW / 2, y: -cardH * 1.6 }
	}
	if (side === "right") {
		return { x: cw + cardW * 0.8, y: ch * 0.52 - cardH / 2 }
	}
	return { x: cw * 0.5 - cardW / 2, y: ch + cardH * 0.8 }}

const scheduleNextIdle = (player, now) => {
	player.nextIdleAt = now + randomBetween(4500, 10000)
	player.portraitUntil = 0
	if (player.portrait !== "default") {
		player.portrait = "default"
	}
}

const pickWinnerPenaltyReaction = (trickPoints, hasQueenOfSpades) => {
	if (hasQueenOfSpades) {
		return Math.random() < 0.88 ? randomItem(HIGH_INTENSITY_NEGATIVE_REACTIONS) : randomItem(LOW_INTENSITY_NEGATIVE_REACTIONS)
	}

	// One heart is always a mild reaction.
	if (trickPoints <= 1) {
		return randomItem(LOW_INTENSITY_NEGATIVE_REACTIONS)
	}

	// More hearts increase anguish chance, while keeping some randomness.
	if (trickPoints === 2) {
		return Math.random() < 0.35 ? randomItem(HIGH_INTENSITY_NEGATIVE_REACTIONS) : randomItem(LOW_INTENSITY_NEGATIVE_REACTIONS)
	}
	if (trickPoints === 3) {
		return Math.random() < 0.55 ? randomItem(HIGH_INTENSITY_NEGATIVE_REACTIONS) : randomItem(LOW_INTENSITY_NEGATIVE_REACTIONS)
	}
	return Math.random() < 0.75 ? randomItem(HIGH_INTENSITY_NEGATIVE_REACTIONS) : randomItem(LOW_INTENSITY_NEGATIVE_REACTIONS)
}

const pickOtherPlayersReaction = (trickPoints, hasQueenOfSpades) => {
	if (hasQueenOfSpades || trickPoints >= 4) {
		return randomItem(HIGH_INTENSITY_POSITIVE_REACTIONS)
	}
	if (trickPoints >= 2) {
		return Math.random() < 0.45 ? randomItem(HIGH_INTENSITY_POSITIVE_REACTIONS) : randomItem(LOW_INTENSITY_POSITIVE_REACTIONS)
	}
	return Math.random() < 0.2 ? randomItem(HIGH_INTENSITY_POSITIVE_REACTIONS) : randomItem(LOW_INTENSITY_POSITIVE_REACTIONS)
}

const triggerPenaltyReactions = (winnerIndex, trickPoints, hasQueenOfSpades, now) => {
	for (let i = 0; i < state.players.length; i += 1) {
		const player = state.players[i]
		const p = player.personality || { reactionSpeed: 0.5, reactionDuration: 0.5, recklessness: 0.5 }
		// reactionSpeed 0→1s delay, 1→0s delay
		const reactionDelay = (1 - p.reactionSpeed) * 1000
		// reactionDuration 0→1× base (2700ms), 1→2× base (5400ms)
		const baseDuration = 2700
		const duration = baseDuration * (1 + p.reactionDuration)
		const reactionAt = now + reactionDelay
		const mood = i === winnerIndex
			? pickWinnerPenaltyReaction(trickPoints, hasQueenOfSpades)
			: pickOtherPlayersReaction(trickPoints, hasQueenOfSpades)
		if (reactionDelay <= 0) {
			player.portrait = mood
			player.portraitUntil = now + duration
		} else {
			player.pendingReaction = { mood, showAt: reactionAt, until: reactionAt + duration }
		}
		player.nextIdleAt = now + reactionDelay + duration + randomBetween(2500, 5000)
	}
}

const updatePortraits = (now ) => {
	if (state.gameOver?.active) {
		const rankByPlayer = Array.isArray(state.gameOver.rankByPlayer) ? state.gameOver.rankByPlayer : []
		const winnerTauntAt = state.gameOver.winnerTauntAt || Number.POSITIVE_INFINITY
		const winnerSmileAt = state.gameOver.winnerSmileAt || Number.POSITIVE_INFINITY
		const loserFrownAt = state.gameOver.loserFrownAt || Number.POSITIVE_INFINITY
		const thirdDefaultAt = state.gameOver.thirdDefaultAt || Number.POSITIVE_INFINITY
		for (let i = 0; i < state.players.length; i += 1) {
			const player = state.players[i]
			const rank = rankByPlayer[i] || 0
			if (rank === 1) {
				if (now < winnerTauntAt) {
					player.portrait = "laugh"
				} else if (now < winnerSmileAt) {
					player.portrait = "taunt"
				} else {
					player.portrait = "smile"
				}
			} else if (rank === 3) {
				player.portrait = now < thirdDefaultAt ? "frown" : "default"
			} else if (rank === 4) {
				player.portrait = now < loserFrownAt ? "anguish" : "frown"
			} else {
				player.portrait = "default"
			}
			player.portraitUntil = Number.POSITIVE_INFINITY
			player.pendingReaction = null
		}
		return
	}

	for (const player of state.players) {
		// Apply pending delayed reaction now if it's time
		if (player.pendingReaction && now >= player.pendingReaction.showAt) {
			player.portrait = player.pendingReaction.mood
			player.portraitUntil = player.pendingReaction.until
			player.pendingReaction = null
		}

		if (now < player.portraitUntil) {
			continue
		}

		if (player.portrait !== "default" && player.portrait !== "idle") {
			scheduleNextIdle(player, now)
	continue
	}

		if (player.portrait === "idle") {
			player.portrait = "default"
	scheduleNextIdle(player, now)
	continue
	}

		if (now >= player.nextIdleAt) {
			player.portrait = "idle"
	player.portraitUntil = now + randomBetween(700, 1400)
	}
	}
}

const updateTurnStatus = ( ) => {
	if (state.dealAnimation.active) {
		setStatus(`Round ${state.roundNumber}  Dealing cards...`)
	return
	}

	if (state.passPhase.active) {
		const directionLabel = state.passPhase.direction.toUpperCase()
	setStatus(`Round ${state.roundNumber}  Pass 3 cards ${directionLabel} (${state.passPhase.humanSelected.length}/3 selected)`)
	return
	}

	const scores = state.players
		.map((p) => `${p.name}: ${p.totalPoints}`)
		.join(" | ")
	if (!state.roundInProgress) {
		setStatus(`Round ${state.roundNumber} complete. ${scores}`)
	return
	}

	const turnName = state.players[state.currentTurn]?.name || "-"
	setStatus(`Round ${state.roundNumber}  Trick ${state.trickNumber + 1}/13  Turn: ${turnName}  |  ${scores}`)
}

const passTargetIndex = (playerIndex, direction) => {
	if (direction === "left") {
		return nextClockwisePlayer(playerIndex)
	}
	if (direction === "right") {
		return previousClockwisePlayer(playerIndex)
	}
	return nextClockwisePlayer(nextClockwisePlayer(playerIndex))
}

const passSourceIndex = (playerIndex, direction) => {
	if (direction === "left") {
		return previousClockwisePlayer(playerIndex)
	}
	if (direction === "right") {
		return nextClockwisePlayer(playerIndex)
	}
	return previousClockwisePlayer(previousClockwisePlayer(playerIndex))
}

const sideAnchorForPlayer = (playerIndex, cardW, cardH) => {
	const cw = canvas.clientWidth
	const ch = canvas.clientHeight
	const side = playerScreenSide(playerIndex)
	if (side === "bottom") {
		return { x: cw * 0.5 - cardW / 2, y: ch + cardH * 0.8 }
	}
	if (side === "left") {
		return { x: -cardW * 1.8, y: ch * 0.52 - cardH / 2 }
	}
	if (side === "top") {
		return { x: cw * 0.5 - cardW / 2, y: -cardH * 1.6 }
	}
	return { x: cw + cardW * 0.8, y: ch * 0.52 - cardH / 2 }}

const passExitForPlayer = (playerIndex, cardW, cardH) => {
	const cw = canvas.clientWidth
	const ch = canvas.clientHeight
	const side = playerScreenSide(playerIndex)
	if (side === "bottom") {
		return { x: cw * 0.5 - cardW / 2, y: ch + cardH * 3.2 }
	}
	if (side === "left") {
		return { x: -cardW * 4.2, y: ch * 0.52 - cardH / 2 }
	}
	if (side === "top") {
		return { x: cw * 0.5 - cardW / 2, y: -cardH * 4.2 }
	}
	return { x: cw + cardW * 3.2, y: ch * 0.52 - cardH / 2 }
}

const beginPassTransferAnimation = (now, outgoing, humanReceived, direction) => {
	const cardH = Math.min(170, canvas.clientHeight * 0.27)
	const cardW = cardH * 0.72
	const giverIndex = passSourceIndex(HUMAN_INDEX, direction)
	const recipientIndex = passTargetIndex(HUMAN_INDEX, direction)
	const layout = handLayout(state.players[HUMAN_INDEX].hand.length + outgoing[HUMAN_INDEX].length, state.handFanProgress)
	const selected = state.passPhase.humanSelected.slice().sort((a, b) => a - b)
	const outTarget = passExitForPlayer(recipientIndex, cardW, cardH)
	const inStart = sideAnchorForPlayer(giverIndex, cardW, cardH)
	const finalHumanHand = sortHand(state.players[HUMAN_INDEX].hand.concat(humanReceived))
	const finalLayout = handLayout(finalHumanHand.length, 0)
	const receivedSlotIndices = []
	for (const received of humanReceived) {
		receivedSlotIndices.push(finalHumanHand.indexOf(received))
	}

	const outgoingCards = selected.map((index, i) => {
		const slot = layout[index] || layout[layout.length - 1]
	const targetX = outTarget.x + (Math.random() - 0.5) * 46
	const targetY = outTarget.y + (Math.random() - 0.5) * 36
	return {
			img: outgoing[HUMAN_INDEX][i]?.img || null,
			startX: slot.x,
			startY: slot.y,
			targetX,
			targetY,
			ctrlX: (slot.x + targetX) * 0.5,
			ctrlY: (slot.y + targetY) * 0.5 - 58,
			w: cardW,
			h: cardH,
			startAngle: 0,
			targetAngle: (Math.random() - 0.5) * 0.8
		}
	})
	const incomingCards = humanReceived.map((_, i) => {
		const slotIndex = receivedSlotIndices[i] >= 0 ? receivedSlotIndices[i] : i
	const slot = finalLayout[slotIndex] || finalLayout[finalLayout.length - 1]
	const stagingX = slot.x
	const stagingY = slot.y - 108
	return {
			img: _.img || null,
			startX: inStart.x + (Math.random() - 0.5) * 34,
			startY: inStart.y + (Math.random() - 0.5) * 30,
			stagingX,
			stagingY,
			dropX: slot.x,
			dropY: slot.y,
			w: cardW,
			h: cardH,
			ctrlX: (inStart.x + stagingX) * 0.5,
			ctrlY: Math.min(inStart.y, stagingY) - 64,
			startAngle: (Math.random() - 0.5) * 0.6,
			stagingAngle: (Math.random() - 0.5) * 0.2,
			dropAngle: slot.angle || 0
		}
	})
	state.passTransfer.active = true
	state.passTransfer.startAt = now
	state.passTransfer.outgoingCards = outgoingCards
	state.passTransfer.incomingCards = incomingCards
	state.passTransfer.finalHumanHand = finalHumanHand
	state.passPhase.active = false
	state.passPhase.humanSelected = []
	state.handFanProgress = 0
	state.handFanStartAt = 0
	updateTurnStatus()
}

const chooseComputerPassIndices = (playerIndex ) => {
	const player = state.players[playerIndex]
	const hand = player.hand
	const styleRecklessness = player.personality?.recklessness ?? 0.5
	if (!hand || hand.length < 3) {
		return hand.map((_, i) => i)
	}

	const suitCounts = { clubs: 0, diamonds: 0, spades: 0, hearts: 0 }
	for (const card of hand) {
		suitCounts[card.suit] += 1
	}

	const heartsInHand = suitCounts.hearts
	const hasQueen = hand.some((card) => card.suit === "spades" && card.rank === "Q")
	const nonQueenSpades = hand.filter((card) => card.suit === "spades" && card.rank !== "Q").length
	const totalPenaltyPoints = heartsInHand + (hasQueen ? 13 : 0)
	const voidUrgency = Math.min(1.8, 0.7 + totalPenaltyPoints / 8)

	let best = null

	for (let a = 0; a < hand.length - 2; a += 1) {
		for (let b = a + 1; b < hand.length - 1; b += 1) {
			for (let c = b + 1; c < hand.length; c += 1) {
				const indices = [a, b, c]
				const selected = [hand[a], hand[b], hand[c]]
				const afterCounts = {
					clubs: suitCounts.clubs,
					diamonds: suitCounts.diamonds,
					spades: suitCounts.spades,
					hearts: suitCounts.hearts
				}

				let selectedHearts = 0
				let selectedHighHearts = 0
				let selectedSpades = 0
				let selectedQueen = false
				let selectedPenaltyPoints = 0

				for (const card of selected) {
					afterCounts[card.suit] -= 1
					if (card.suit === "hearts") {
						selectedHearts += 1
						selectedPenaltyPoints += 1
						if (RANK_VALUE[card.rank] >= 11) {
							selectedHighHearts += 1
						}
					}
					if (card.suit === "spades") {
						selectedSpades += 1
						if (card.rank === "Q") {
							selectedQueen = true
							selectedPenaltyPoints += 13
						}
					}
				}

				const retainedQueen = hasQueen && !selectedQueen
				const retainedPenaltyPoints = totalPenaltyPoints - selectedPenaltyPoints
				const spadesAfterExcludingQueen = Math.max(0, afterCounts.spades - (retainedQueen ? 1 : 0))
				const hasGoodQueenCoverAfter = spadesAfterExcludingQueen >= 4
				const selectedRankSum = selected.reduce((sum, card) => sum + RANK_VALUE[card.rank], 0)

				let voidsCreated = 0
				let nearVoidsCreated = 0
				for (const suit of SUITS) {
					if (suitCounts[suit] > 0 && afterCounts[suit] === 0) {
						voidsCreated += 1
					} else if (suitCounts[suit] > 1 && afterCounts[suit] === 1) {
						nearVoidsCreated += 1
					}
				}

				const maxSelectedInOneSuit = Math.max(
					selected.filter((card) => card.suit === "clubs").length,
					selected.filter((card) => card.suit === "diamonds").length,
					selected.filter((card) => card.suit === "spades").length,
					selected.filter((card) => card.suit === "hearts").length
				)

				let comboScore = 0

				// Pass points away first, with very heavy queen priority.
				comboScore += selectedHearts * 180
				comboScore += selectedHighHearts * 40
				comboScore += selectedPenaltyPoints * 38

				if (hasQueen) {
					if (selectedQueen) {
						comboScore += hasGoodQueenCoverAfter ? 220 : 1800
					} else {
						comboScore -= hasGoodQueenCoverAfter ? 120 : 2200
					}
				}

				// More penalty in hand means stronger focus on creating/locking in voids.
				comboScore += voidUrgency * (voidsCreated * 260 + nearVoidsCreated * 90)
				comboScore += voidUrgency * (maxSelectedInOneSuit - 1) * 85

				// If we keep lots of points, prioritize that less.
				comboScore -= retainedPenaltyPoints * 24

				// Keep enough spades only if we are forced to retain the queen.
				if (retainedQueen) {
					comboScore += selectedSpades * 45
					if (!hasGoodQueenCoverAfter) {
						comboScore -= 260
					}
				}

				// Personality only breaks ties between objectively equal choices.
				const tieScore =
					(0.5 - styleRecklessness) * (voidsCreated * 40 + nearVoidsCreated * 18)
					+ (styleRecklessness - 0.5) * (selectedRankSum * 0.6 + selectedHighHearts * 14)

				if (!best || comboScore > best.score || (comboScore === best.score && tieScore > best.tieScore)) {
					best = { score: comboScore, tieScore, indices }
				}
			}
		}
	}

	if (!best) {
		return [0, 1, 2]
	}

	return best.indices
}

const removeCardsAtIndices = (hand, indices) => {
	const sorted = indices.slice().sort((a, b) => b - a)
	const picked = []
	for (const index of sorted) {
		if (index >= 0 && index < hand.length) {
			picked.push(hand.splice(index, 1)[0])
	}
	}
	return picked
}

const quadraticPoint = (a, b, c, t) => {
	const u = 1 - t
	return u * u * a + 2 * u * t * b + t * t * c
}

const executePassing = (now ) => {
	if (!state.passPhase.active || state.passPhase.humanSelected.length !== 3) {
		return
	}

	const direction = state.passPhase.direction
	const outgoing = [[], [], [], []]
	outgoing[HUMAN_INDEX] = removeCardsAtIndices(state.players[HUMAN_INDEX].hand, state.passPhase.humanSelected)
	for (let i = 1; i < PLAYER_COUNT; i += 1) {
		const computerIndices = chooseComputerPassIndices(i)
	outgoing[i] = removeCardsAtIndices(state.players[i].hand, computerIndices)
	}

	const humanGiver = passSourceIndex(HUMAN_INDEX, direction)
	const humanReceived = outgoing[humanGiver]
	for (let from = 0; from < PLAYER_COUNT; from += 1) {
		const to = passTargetIndex(from, direction)
	if (to === HUMAN_INDEX) {
			continue
	}
		state.players[to].hand.push(...outgoing[from])
	state.players[to].hand = sortHand(state.players[to].hand)
	}

	beginPassTransferAnimation(now, outgoing, humanReceived, direction)
}

const startPassingPhase = ( ) => {
	state.passPhase.active = true
	state.passPhase.direction = PASS_DIRECTIONS[(state.roundNumber - 1) % PASS_DIRECTIONS.length]
	state.passPhase.humanSelected = []
	state.passTransfer.active = false
	state.passTransfer.outgoingCards = []
	state.passTransfer.incomingCards = []
	state.passTransfer.finalHumanHand = []
	state.roundInProgress = false
	state.currentTurn = -1
	state.handFanProgress = 0
	state.handFanStartAt = 0
	state.handLifts = new Array(state.players[HUMAN_INDEX].hand.length).fill(0)
	updateTurnStatus()
}

const dealTargetForCard = (playerIndex, slotIndex, cardW, cardH) => {
	const cw = canvas.clientWidth
	const ch = canvas.clientHeight
	if (playerIndex === HUMAN_INDEX) {
		const slots = handLayout(13)
	const slot = slots[slotIndex] || slots[slots.length - 1]
	return { x: slot.x, y: slot.y }
	}

	const frame = frameForPlayer(playerIndex)
	if (!frame) {
		return { x: cw / 2 - cardW / 2, y: ch / 2 - cardH / 2 }
	}

	const rect = frameRect(frame)
	const fx = rect.x
	const fy = rect.y
	const fw = rect.w
	const fh = rect.h
	const jitterX = (slotIndex % 3 - 1) * 4
	const jitterY = (slotIndex % 4 - 1.5) * 3
	if (playerIndex === 1) {
		return { x: fx + fw * 0.18 - cardW / 2 + jitterX, y: fy + fh * 0.58 - cardH / 2 + jitterY }
	}
	if (playerIndex === 2) {
		return { x: fx + fw * 0.5 - cardW / 2 + jitterX, y: fy + fh * 0.28 - cardH / 2 + jitterY }
	}
	return { x: fx + fw * 0.82 - cardW / 2 + jitterX, y: fy + fh * 0.58 - cardH / 2 + jitterY }}

const beginRoundDealAnimation = (now ) => {
	const cardH = Math.min(170, canvas.clientHeight * 0.27)
	const cardW = cardH * 0.72
	const centerX = canvas.clientWidth / 2 - cardW / 2
	const centerY = canvas.clientHeight * 0.47 - cardH / 2
	const cw = canvas.clientWidth
	const ch = canvas.clientHeight
	const bursts = [
		{ targetX: -cardW * 1.4, targetY: ch * 0.48 - cardH / 2 },
		{ targetX: cw + cardW * 0.4, targetY: ch * 0.48 - cardH / 2 },
		{ targetX: cw * 0.5 - cardW / 2, targetY: -cardH * 1.3 },
		{ targetX: cw * 0.5 - cardW / 2, targetY: ch + cardH * 0.4 }
	]
	state.dealAnimation.active = true
	state.dealAnimation.cardW = cardW
	state.dealAnimation.cardH = cardH
	state.dealAnimation.centerX = centerX
	state.dealAnimation.centerY = centerY
	state.dealAnimation.bursts = bursts
	state.dealAnimation.dealStartAt = now + 70
	state.dealAnimation.completeAt = state.dealAnimation.dealStartAt + state.dealAnimation.enterDuration + state.dealAnimation.pauseDuration + state.dealAnimation.flightDuration + 60
	state.roundInProgress = false
	state.roundRestartAt = 0
	state.currentTurn = -1
	state.tablePlays = []
	state.activeHandIndex = -1
	state.handLifts = []
	state.handFanProgress = 0
	state.handFanStartAt = 0
	state.handDrop = 0
	state.handDropUntil = 0
	updateTurnStatus()
}

const finalizeDealtRound = (now ) => {
	if (!state.pendingRound) {
		return
	}

	for (let i = 0; i < PLAYER_COUNT; i += 1) {
		const player = state.players[i]
	player.hand = sortHand(state.pendingRound.hands[i])
	player.taken = []
	player.roundPoints = 0
	scheduleNextIdle(player, now)
	}

	state.currentTurn = state.pendingRound.leaderIndex
	state.leaderIndex = state.currentTurn
	state.leadSuit = null
	state.tablePlays = []
	state.heartsBroken = false
	state.trickNumber = 0
	state.roundInProgress = false
	state.actionPauseUntil = 0
	state.computerActAt = now + randomBetween(450, 900)
	state.trickResolveAt = 0
	state.trickCollecting = false
	state.trickCollectWinnerIndex = -1
	state.trickCollectDoneAt = 0
	state.handLifts = new Array(state.players[HUMAN_INDEX].hand.length).fill(0)
	state.handFanProgress = 0
	state.handFanStartAt = now
	state.handDrop = 0
	state.handDropUntil = 0
	state.dealAnimation.active = false
	state.dealAnimation.bursts = []
	state.pendingRound = null
	startPassingPhase()
	updateTurnStatus()
}

const dealRound = (now ) => {
	const deck = shuffle(state.deck.map((card) => ({ ...card })))
	const hands = [[], [], [], []]
	for (let i = 0; i < deck.length; i += 1) {
		hands[i % PLAYER_COUNT].push(deck[i])
	}

	const leaderIndex = hands.findIndex((cards) => cards.some((card) => card.suit === "clubs" && card.rank === "2"))
	state.pendingRound = {
		hands,
		leaderIndex: leaderIndex >= 0 ? leaderIndex : 0
	}
	beginRoundDealAnimation(now)
}

const chooseComputerCardIndex = (playerIndex ) => {
	const player = state.players[playerIndex]
	const legal = legalCardIndices(playerIndex)
	if (legal.length === 0) {
		return 0
	}

	const styleRecklessness = player.personality?.recklessness ?? 0.5
	const strategyRecklessness = 0.5

	// Determine if we are following suit or leading
	const isLeading = state.tablePlays.length === 0
	const leadSuit = state.leadSuit

	// Moon-shooting mode: player controls a majority of the hearts in the deck
	const heartsTaken = player.taken.filter((c) => c.suit === "hearts").length
	const heartsInHand = player.hand.filter((c) => c.suit === "hearts").length
	const pursuingMoon = false
	const queenSpadesPlayed = hasQueenOfSpadesBeenPlayed()
	const queenInHand = player.hand.some((card) => card.suit === "spades" && card.rank === "Q")
	const trickHasPoints = state.tablePlays.some((play) => cardPoints(play.card) > 0)
	const playersAfter = PLAYER_COUNT - state.tablePlays.length - 1
	let highestLeadRank = -1
	if (!isLeading && leadSuit) {
		for (const play of state.tablePlays) {
			if (play.card.suit === leadSuit) {
				highestLeadRank = Math.max(highestLeadRank, RANK_VALUE[play.card.rank])
			}
		}
	}

	// Void-creation pressure: how urgently we want to exhaust a short suit
	const penaltyInHand = player.hand.reduce((sum, c) => sum + cardPoints(c), 0)
	const voidPressure = Math.min(1, penaltyInHand / 10) * strategyRecklessness

	// Suit-length map used for void-creation scoring
	const suitCounts = {}
	for (const c of player.hand) {
		suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1
	}

	// Score each legal card — lower score = preferred
	const scored = legal.map((index) => {
		const card = player.hand[index]
		let score = 0
		let tieScore = 0

		const penalty = cardPoints(card)
		const isQueenOfSpades = card.suit === "spades" && card.rank === "Q"
		const suitLen = suitCounts[card.suit] || 1

		if (pursuingMoon) {
			// Moon mode: aggressively collect penalty cards
			score -= penalty * 150
			if (isLeading) {
				// Lead high to win tricks and accumulate hearts
				score -= strategyRecklessness * RANK_VALUE[card.rank] * 5
				if (!queenSpadesPlayed && card.suit === "spades" && (card.rank === "K" || card.rank === "A")) {
					// In moon mode, high spades help force/collect Q-spades.
					score -= 120
				}
			} else if (card.suit === leadSuit) {
				const wouldWin = RANK_VALUE[card.rank] > highestLeadRank
				if (wouldWin && trickHasPoints) {
					score -= strategyRecklessness * 400
				}
				if (!queenSpadesPlayed && leadSuit === "spades" && (card.rank === "K" || card.rank === "A") && wouldWin && playersAfter > 0) {
					// In moon mode, encourage taking control of spade tricks before Q appears.
					score -= 180
				}
				// Play higher cards to win tricks
				score -= strategyRecklessness * RANK_VALUE[card.rank] * 3
			}
		} else {
			// Normal mode

			// Base: always avoid penalty cards when possible
			score += penalty * 100
			if (isQueenOfSpades && !queenSpadesPlayed) {
				score += 240
			}

			if (isLeading) {
				// When leading, reckless players dump high point cards;
				// cautious players lead safe low non-point cards
				if (penalty > 0) {
					score += (1 - strategyRecklessness) * 200 - strategyRecklessness * 80
				}
				// Cautious players prefer low-rank safe leads
				score += (1 - strategyRecklessness) * RANK_VALUE[card.rank] * 4
				// Void creation: lead from the shortest suit to exhaust it faster
				score -= voidPressure * (5 - Math.min(suitLen, 5)) * 18
				if (!queenSpadesPlayed && card.suit === "spades" && (card.rank === "K" || card.rank === "A")) {
					// Before Q is played, avoid leading K/A of spades and risking taking Q.
					score += 280 + (1 - strategyRecklessness) * 220
				}
				if (isQueenOfSpades && !queenSpadesPlayed) {
					// Leading Q is usually dangerous unless we are desperate.
					score += 320
				}
			} else {
				// Following suit
				if (card.suit === leadSuit) {
					const wouldWin = RANK_VALUE[card.rank] > highestLeadRank
					if (isQueenOfSpades && !queenSpadesPlayed) {
						const safeNow = highestLeadRank > RANK_VALUE["Q"]
						// Dump Q aggressively, especially when a higher spade is already in the trick.
						score -= safeNow ? 2800 : 950
						if (wouldWin && playersAfter === 0) {
							score += 700
						}
					}

					if (wouldWin && trickHasPoints) {
						// Would win a trick that has penalty cards
						// Cautious: strongly avoid; Reckless: don't care
						score += (1 - strategyRecklessness) * 300
					}

					if (wouldWin && !trickHasPoints) {
						// Winning a clean trick: cautious players still mildly prefer not to lead high
						score += (1 - strategyRecklessness) * RANK_VALUE[card.rank] * 3
					}

					if (!wouldWin) {
						// Safe to play high — reckless players prefer to dump high cards here
						score -= strategyRecklessness * RANK_VALUE[card.rank] * 3
					}

					if (!queenSpadesPlayed && leadSuit === "spades" && (card.rank === "K" || card.rank === "A") && wouldWin && playersAfter > 0) {
						// Strongly avoid winning a spade trick with K/A while Q can still be dropped.
						score += 360 + (1 - strategyRecklessness) * 240
					}
				} else {
					// Discarding (off-suit) — good chance to dump penalty cards
					// Reckless: eagerly dump highest penalty cards
					// Cautious: still dumps penalty cards but prefers lowest-value ones
					if (isQueenOfSpades && !queenSpadesPlayed) {
						// If we are void in lead suit, ditch Q immediately.
						score -= 4000
					}
					if (card.suit === "hearts") {
						score -= 320
						score -= RANK_VALUE[card.rank] * 8
					}
					score -= strategyRecklessness * penalty * 60
					score += (1 - strategyRecklessness) * RANK_VALUE[card.rank] * 2
					// Void creation: prefer discarding from suits closest to being voided
					score -= voidPressure * (4 - Math.min(suitLen, 4)) * 15
					if (queenInHand && !queenSpadesPlayed && card.suit === "spades" && !isQueenOfSpades) {
						// Keep some spades around while still holding Q to reduce forced high-spade plays.
						score += 80
					}
				}
			}

			// Personality only influences equally scored objective choices.
			const rankValue = RANK_VALUE[card.rank]
			const styleLean = styleRecklessness - 0.5
			if (isLeading) {
				tieScore += styleLean * rankValue * 3
			} else if (card.suit === leadSuit) {
				tieScore += styleLean * rankValue * 4
			} else {
				tieScore += styleLean * rankValue * 6
			}
			if (card.suit === "hearts") {
				tieScore += styleLean * 10
			}
			if (isQueenOfSpades) {
				tieScore += styleLean * 22
			}
		}

		return { index, score, tieScore }
	})

	scored.sort((a, b) => {
		if (a.score !== b.score) {
			return a.score - b.score
		}
		return a.tieScore - b.tieScore
	})
	return scored[0].index
}

const playCard = (playerIndex, cardIndex, now) => {
	if (now < (state.actionPauseUntil || 0)) {
		return
	}

	const player = state.players[playerIndex]
	if (!player || cardIndex < 0 || cardIndex >= player.hand.length) {
		return
	}

	const legal = legalCardIndices(playerIndex)
	if (!legal.includes(cardIndex)) {
		if (playerIndex === HUMAN_INDEX) {
			setStatus("That card is not legal right now.")
	}
		return
	}

	const card = player.hand.splice(cardIndex, 1)[0]
	if (card.suit === "hearts" && !state.heartsBroken) {
		state.heartsBroken = true
	triggerHeartsBrokenOverlay(now)
	} else if (card.suit === "hearts") {
		state.heartsBroken = true
	}

	const tableCardH = Math.min(140, canvas.clientHeight * 0.21)
	const tableCardW = tableCardH * 0.72
	const start = seatOriginForPlayer(playerIndex, tableCardW, tableCardH, cardIndex)
	const target = tableTargetForPlayer(playerIndex, tableCardW, tableCardH)
	state.tablePlays.push({
		playerIndex,
		card,
		x: start.x,
		y: start.y,
		targetX: target.x,
		targetY: target.y,
		w: tableCardW,
		h: tableCardH,
		angle: 0,
		targetAngle: 0,
		flipT: playerIndex === HUMAN_INDEX ? 1.0 : 0.0,
		collecting: false
	})
	if (state.tablePlays.length === 1) {
		state.leadSuit = card.suit
	}

	if (state.tablePlays.length === PLAYER_COUNT) {
		state.currentTurn = -1
	state.trickResolveAt = now + 700
	} else {
		state.currentTurn = nextClockwisePlayer(playerIndex)
		if (state.currentTurn !== HUMAN_INDEX) {
			state.computerActAt = now + randomBetween(380, 900)
	}
	}

	if (playerIndex === HUMAN_INDEX) {
		state.activeHandIndex = -1
	}

	updateTurnStatus()
}

const resolveTrick = (now ) => {
	if (state.tablePlays.length !== PLAYER_COUNT || !state.leadSuit) {
		return
	}

	let winningPlay = null
	for (const play of state.tablePlays) {
		if (play.card.suit !== state.leadSuit) {
			continue
	}
		if (!winningPlay || RANK_VALUE[play.card.rank] > RANK_VALUE[winningPlay.card.rank]) {
			winningPlay = play
	}
	}

	const winnerIndex = winningPlay ? winningPlay.playerIndex : state.leaderIndex
	const winner = state.players[winnerIndex]
	let trickPoints = 0
	let hasQueenOfSpades = false
	for (const play of state.tablePlays) {
		winner.taken.push(play.card)
	trickPoints += cardPoints(play.card)
	if (play.card.suit === "spades" && play.card.rank === "Q") {
			hasQueenOfSpades = true
	}
	}
	if (trickPoints > 0) {
		winner.roundPoints += trickPoints
		recalculateRoundPointsFromTaken()
	triggerPenaltyReactions(winnerIndex, trickPoints, hasQueenOfSpades, now)
	}

	state.trickResolveAt = 0
	startTrickCollect(winnerIndex, now)
}

const applyRoundEndExpressions = () => {
	const ranked = state.players
		.map((player, index) => ({
			index,
			roundPoints: player.roundPoints,
			totalPoints: player.totalPoints
		}))
		.sort((a, b) => {
			if (a.roundPoints !== b.roundPoints) {
				return a.roundPoints - b.roundPoints
			}
			if (a.totalPoints !== b.totalPoints) {
				return a.totalPoints - b.totalPoints
			}
			return a.index - b.index
		})

	const bestIndex = ranked[0]?.index
	const worstIndex = ranked[ranked.length - 1]?.index

	for (let i = 0; i < state.players.length; i += 1) {
		const player = state.players[i]
		if (i === bestIndex) {
			player.portrait = "smile"
		} else if (i === worstIndex) {
			player.portrait = "frown"
		} else {
			player.portrait = "default"
		}
		player.portraitUntil = Number.POSITIVE_INFINITY
		player.pendingReaction = null
	}
}

const finishRound = (now ) => {
	recalculateRoundPointsFromTaken()
	applyRoundEndExpressions()

	// Shoot the moon: a player who took all 26 points gets 0 — everyone else gets +26
	const moonShooter = state.players.find((p) => p.roundPoints === 26)
	if (moonShooter) {
		for (const player of state.players) {
			if (player !== moonShooter) {
				player.totalPoints += 26
			}
		}
	} else {
		for (const player of state.players) {
			player.totalPoints += player.roundPoints
		}
	}

	state.roundInProgress = false
	state.roundRestartAt = now + 2500
	state.currentTurn = -1
	let summary
	if (moonShooter) {
		const totals = state.players.map((p) => `${p.name}: total ${p.totalPoints}`).join(" | ")
		summary = `${moonShooter.name} shot the moon! All others +26 — ${totals}`
	} else {
		summary = state.players.map((p) => `${p.name}: +${p.roundPoints} (total ${p.totalPoints})`).join(" | ")
	}
	setStatus(`Round ${state.roundNumber} scoring: ${summary}`)
	const overTarget = state.players.some((p) => p.totalPoints >= state.gameConfig.targetScore)
	if (overTarget) {
		beginGameOver(now)
		return
	}
	state.roundNumber += 1
}

const updatePointerPosition = (event ) => {
	const rect = canvas.getBoundingClientRect()
	state.pointer.x = event.clientX - rect.left
	state.pointer.y = event.clientY - rect.top
}

const handleHumanPlayAttempt = ( ) => {
	if (state.gameConfig.awaitingModeSelection) {
		return
	}

	if (state.gameOver.active) {
		return
	}

	if (state.passPhase.active) {
		const hand = state.players[HUMAN_INDEX].hand
	if (hand.length === 0) {
			return
	}
		const layout = getHandInteractionLayout(hand)
	const hovered = getHoveredCard(layout)
	if (hovered < 0) {
			return
	}
		const selected = state.passPhase.humanSelected
	const existing = selected.indexOf(hovered)
	if (existing >= 0) {
			selected.splice(existing, 1)
	} else if (selected.length < 3) {
			selected.push(hovered)
	}
		if (selected.length === 3) {
			executePassing(performance.now())
	}
		updateTurnStatus()
	return
	}

	if (!state.roundInProgress || state.currentTurn !== HUMAN_INDEX) {
		return
	}
	const hand = state.players[HUMAN_INDEX].hand
	if (hand.length === 0) {
		return
	}
	const layout = getHandInteractionLayout(hand)
	const hovered = getHoveredCard(layout)
	if (hovered < 0) {
		return
	}
	playCard(HUMAN_INDEX, hovered, performance.now())
}

const bindEvents = ( ) => {
	if (switchModeButton && !switchModeButton.dataset.bound) {
		switchModeButton.addEventListener("click", () => {
			switchGameModeAfterGameOver()
		})
		switchModeButton.dataset.bound = "true"
	}
	for (const button of modeButtons) {
		if (button.dataset.bound) {
			continue
		}
		button.addEventListener("click", () => {
			const targetScore = Number(button.dataset.targetScore) || SHORT_GAME_SCORE
			startGameWithTargetScore(targetScore)
		})
		button.dataset.bound = "true"
	}

	canvas.addEventListener("mousedown", (event) => {
		state.pointer.active = true
		updatePointerPosition(event)
		handleFramePointerDown()
	})
	canvas.addEventListener("mousemove", (event) => {
		state.pointer.active = true
	updatePointerPosition(event)
		updateDraggedFrame()
	})
	canvas.addEventListener("mouseleave", () => {
		handleFramePointerUp()
		state.pointer.active = false
	state.activeHandIndex = -1
	canvas.style.cursor = "default"
	})
	window.addEventListener("mouseup", (event) => {
		if (event?.clientX !== undefined && event?.clientY !== undefined) {
			updatePointerPosition(event)
		}
		handleFramePointerUp()
	})
	canvas.addEventListener("click", (event) => {
		updatePointerPosition(event)
		if (state.windowInteraction.suppressClick) {
			state.windowInteraction.suppressClick = false
			return
		}
	handleHumanPlayAttempt()
	})
	canvas.addEventListener("touchstart", (event) => {
		const touch = event.changedTouches[0]
	state.pointer.active = true
	updatePointerPosition(touch)
	handleHumanPlayAttempt()
	}, { passive: true })
	window.addEventListener("resize", resizeCanvas)
}

const loadCharacterImages = async () => {
	const moods = ["default", "idle", "anguish", "frown", "smile", "laugh", "taunt"]
	const characters = Array.isArray(CHARACTERS) ? CHARACTERS : []
	const loadedByCharacter = await Promise.all(characters.map(async (character) => {
		const folder = character.folder || "mitch"
		const loadedMoods = await Promise.all(moods.map(async (mood) => [mood, await loadImage(`assets/characters/${folder}/${mood}.png`)]))
		return [character.name, Object.fromEntries(loadedMoods)]
	}))
	state.characterImages = Object.fromEntries(loadedByCharacter)
}

const loadSuitIcons = async () => {
	const icons = await Promise.all([
		["clubs", await loadImage("assets/club-icon.png")],
		["diamonds", await loadImage("assets/diamond-icon.png")],
		["spades", await loadImage("assets/spade-icon.png")],
		["hearts", await loadImage("assets/heart-icon.png")],
		["brokenHearts", await loadImage("assets/broken-heart-icon.png")],
		["frame", await loadImage("assets/suit-frame.png")]
	])
	state.suitIcons = Object.fromEntries(icons)
}

const loadUiImages = async () => {
	state.uiImages.rightArrow = await loadImage("assets/right-arrow.png")
}

const loadCardImages = async () => {
	const withImages = await Promise.all(state.deck.map(async (card) => ({
		...card,
		img: await loadImage(card.file)
	})))
	state.deck = withImages
}

const createPlayers = ( ) => {
	const now = performance.now()
	const colorByName = {
		Ron: "#7d8a63",
		Mitch: "#9a6f4f",
		Deena: "#7a5d71"
	}
	const computerPlayers = (Array.isArray(CHARACTERS) && CHARACTERS.length === 3 ? CHARACTERS : [
		{ name: "Ron", folder: "mitch", personality: { reactionSpeed: 0.5, reactionDuration: 0.5, recklessness: 0.5 } },
		{ name: "Mitch", folder: "mitch", personality: { reactionSpeed: 0.5, reactionDuration: 0.5, recklessness: 0.5 } },
		{ name: "Deena", folder: "mitch", personality: { reactionSpeed: 0.5, reactionDuration: 0.5, recklessness: 0.5 } }
	]).map((character) => ({
		name: character.name,
		color: colorByName[character.name] || "#7d8a63",
		hand: [],
		taken: [],
		roundPoints: 0,
		totalPoints: 0,
		portrait: "default",
		portraitUntil: 0,
		nextIdleAt: now + randomBetween(4500, 9000),
		personality: character.personality || { reactionSpeed: 0.5, reactionDuration: 0.5, recklessness: 0.5 }
	}))
	state.players = [
		{ name: "You", color: "#7d8a63", hand: [], taken: [], roundPoints: 0, totalPoints: 0, portrait: "default", portraitUntil: 0, nextIdleAt: now + randomBetween(4500, 9000) },
		...computerPlayers
	]
}

const init = async () => {
	resizeCanvas()
	bindEvents()
	hidePlayAgainButton()
	ensurePlayAgainButton()
	updateSwitchModeButtonLabel()
	createPlayers()
	state.deck = buildDeck()
	setStatus("Loading cards and character states...")
	await Promise.all([
		loadCardImages(),
		loadCharacterImages(),
		loadSuitIcons(),
		loadUiImages()
	])
	state.cardBackImage = await loadImage("assets/cards/card-back.png")
	showModeSelectOverlay()
	requestAnimationFrame(render)
}

init()