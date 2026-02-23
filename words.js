// Word bank for Skribble Clone
const words = {
    easy: [
        'cat', 'dog', 'sun', 'moon', 'star', 'tree', 'fish', 'bird', 'hat', 'cup',
        'ball', 'book', 'door', 'key', 'bed', 'car', 'bus', 'boat', 'shoe', 'sock',
        'cake', 'egg', 'milk', 'rain', 'snow', 'fire', 'lamp', 'ring', 'bell', 'drum',
        'apple', 'house', 'heart', 'smile', 'clock', 'chair', 'table', 'phone', 'pizza',
        'mouse', 'cloud', 'bread', 'spoon', 'fork', 'knife', 'plate', 'glass', 'watch',
        'candy', 'ghost', 'teeth', 'mouth', 'nose', 'hand', 'foot', 'baby', 'king',
        'queen', 'eye', 'ear', 'leaf', 'bone', 'kite', 'nest', 'frog', 'duck', 'bear',
        'lion', 'pig', 'cow', 'hen', 'ant', 'bee', 'web', 'box', 'bag', 'pen',
        'ice', 'map', 'fan', 'pot', 'jar', 'rug', 'bat', 'owl', 'fox', 'gem',
        'bus', 'van', 'cap', 'bow', 'axe', 'net', 'pin', 'saw', 'toy', 'log'
    ],
    medium: [
        'guitar', 'banana', 'rocket', 'dragon', 'castle', 'pirate', 'zombie', 'bridge',
        'candle', 'pencil', 'camera', 'rabbit', 'sunset', 'island', 'garden', 'tunnel',
        'puppet', 'parrot', 'ladder', 'helmet', 'anchor', 'basket', 'bottle', 'bucket',
        'butter', 'cactus', 'cherry', 'cheese', 'coffee', 'cookie', 'desert', 'donkey',
        'feather', 'finger', 'flower', 'forest', 'giraffe', 'hammer', 'igloo', 'jungle',
        'kitten', 'lemon', 'lizard', 'magnet', 'mirror', 'monkey', 'needle', 'orange',
        'palace', 'peanut', 'pepper', 'pillow', 'planet', 'potato', 'pumpkin', 'puzzle',
        'saddle', 'sailor', 'shadow', 'shield', 'shower', 'silver', 'singer', 'spider',
        'sponge', 'statue', 'stripe', 'summer', 'ticket', 'tomato', 'trophy', 'turtle',
        'umbrella', 'violin', 'wallet', 'window', 'winter', 'wizard', 'zebra', 'zipper',
        'airplane', 'balloon', 'blanket', 'cabinet', 'chicken', 'compass', 'curtain',
        'diamond', 'dolphin', 'earring', 'elephant', 'emerald', 'factory', 'fishing',
        'football', 'fortune', 'glacier', 'gorilla', 'holiday', 'iceberg', 'jackpot',
        'lantern', 'library', 'lobster', 'mailbox', 'mermaid', 'monster', 'necklace',
        'octopus', 'olympus', 'panther', 'penguin', 'rainbow', 'reindeer', 'rooster',
        'sailboat', 'sandals', 'scarecrow', 'scissors', 'seagull', 'skeleton', 'snowman',
        'starfish', 'sunrise', 'surfer', 'teacher', 'thunder', 'tornado', 'tractor',
        'unicorn', 'vampire', 'volcano', 'warrior', 'whistle', 'windmill'
    ],
    hard: [
        'astronaut', 'avalanche', 'backflip', 'barricade', 'blueprint', 'boomerang',
        'butterfly', 'camouflage', 'catapult', 'centipede', 'chandelier', 'chameleon',
        'chocolate', 'cloverleaf', 'constellation', 'crossword', 'dandelion', 'detective',
        'dinosaur', 'dragonfly', 'dreamcatcher', 'earthquake', 'electrician', 'escalator',
        'espionage', 'explosion', 'fingerprint', 'fireworks', 'flashlight', 'footprint',
        'gladiator', 'gondola', 'grasshopper', 'grenade', 'guillotine', 'gymnastics',
        'harmonica', 'headphones', 'helicopter', 'hieroglyphics', 'horseshoe', 'hourglass',
        'hummingbird', 'hurricane', 'hypnotize', 'icicle', 'illusion', 'invention',
        'jellyfish', 'jukebox', 'kaleidoscope', 'kangaroo', 'laboratory', 'labyrinth',
        'lawnmower', 'lighthouse', 'lollipop', 'marionette', 'marshmallow', 'microscope',
        'moonlight', 'mosquito', 'motorcycle', 'nightmare', 'observatory', 'origami',
        'parachute', 'pineapple', 'platypus', 'porcupine', 'quicksand', 'rattlesnake',
        'recycling', 'reflection', 'rhinoceros', 'rollercoaster', 'saxophone', 'scarecrow',
        'scoreboard', 'skyscraper', 'sleepwalking', 'snowflake', 'spaceship', 'spaghetti',
        'spotlight', 'staircase', 'steamroller', 'stopwatch', 'strawberry', 'submarine',
        'sunflower', 'swordfish', 'telescope', 'thumbtack', 'trampoline', 'treehouse',
        'tumbleweed', 'typewriter', 'underwater', 'ventriloquist', 'volleyball', 'waterfall',
        'wheelbarrow', 'whirlpool', 'xylophone'
    ]
};

function getRandomWords(count = 3, excludeWords = new Set()) {
    // Build pool excluding already used words
    const difficulties = ['easy', 'medium', 'hard'];
    const pools = difficulties.map(d =>
        words[d].filter(w => !excludeWords.has(w.toLowerCase()))
    );

    const selected = [];
    const localUsed = new Set();

    // Pick one from each difficulty for variety
    for (let i = 0; i < count; i++) {
        const diffIndex = i < difficulties.length ? i : Math.floor(Math.random() * difficulties.length);
        let pool = pools[diffIndex].filter(w => !localUsed.has(w));

        // If this difficulty pool is exhausted, try others
        if (pool.length === 0) {
            pool = pools.flatMap(p => p).filter(w => !localUsed.has(w));
        }

        if (pool.length === 0) break; // All words used!

        // Fisher-Yates-style random pick
        const idx = Math.floor(Math.random() * pool.length);
        selected.push(pool[idx]);
        localUsed.add(pool[idx]);
    }

    return selected;
}

module.exports = { words, getRandomWords };
