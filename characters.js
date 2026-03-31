let CHARACTERS = [
    {
        name: "Leonard",
        folder: "leonard",
        personality: {
            reactionSpeed: .7,
            reactionDuration: 1,
            recklessness: .3,
        }
    },
    {
        name: "Mitch",
        folder: "mitch",
        personality: {
            reactionSpeed: .9,
            reactionDuration: .3,
            recklessness: .8,
        }
    },
	{
        name: "Deena",
        folder: "deena",
        personality: {
            reactionSpeed: 1,
            reactionDuration: .5,
            recklessness: .6,
        }
    },
]

if (Math.random() > .33) {
    CHARACTERS[Math.floor(Math.random() * 2)] = {
        name: "Sunny",
        folder: "sunny",
        personality: {
            reactionSpeed: .3,
            reactionDuration: .9,
            recklessness: 0,
        }
    }
}

if (Math.random() > .9) {
    CHARACTERS[1] = {
        name: "Terry",
        folder: "terry",
        personality: {
            reactionSpeed: .5,
            reactionDuration: .7,
            recklessness: .2,
        }
    }
}
