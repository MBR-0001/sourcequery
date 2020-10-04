const dgram = require("dgram");
const EventEmitter = require("events");

const ids = {
    A2S_INFO: "T",
    S2A_INFO: "I",
    
    S2A_SERVERQUERY_GETCHALLENGE: "A",
    
    A2S_PLAYER: "U",
    S2A_PLAYER: "D",
    
    A2S_RULES: "V",
    S2A_RULES: "E"
};

class Answer {
    constructor() {
        /**
         * @type {Buffer[]}
         */
        this.parts = [];
        this.goldsource = false;
    }

    /**
     * @param {Buffer} buffer 
     */
    add(buffer) {
        if (!this.goldsource) {
            let total = buffer.readInt8();
            let number = buffer.readInt8(1);

            if (number < 0 || number != this.parts.length) {
                this.goldsource = true;
                return this.add(buffer);
            }

            if (this.totalpackets == undefined) this.totalpackets = total;
    
            this.parts[number] = buffer.slice(4);
        }
        
        else {
            //Upper 4 bits represent the number of the current packet (starting at 0) and bottom 4 bits represent the total number of packets (2 to 15).
            let num = buffer.readInt8();
            let number = (num & 240) / 16;
            let total = num & 15;

            if (this.totalpackets == undefined) this.totalpackets = total;

            this.parts[number] = buffer.slice(1);
        }
    }

    get complete() {
        return this.parts.length == this.totalpackets;
    }

    assemble() {
        return Buffer.concat(this.parts).slice(4);
    }
}

class SQUnpacker extends EventEmitter {
    /**
     * @param {dgram.Socket} messageEmitter 
     * @param {number} timeout 
     */
    constructor(messageEmitter, timeout = 1000) {
        super();

        this.timeout = timeout;
        /**
         * @type {Record<string, Answer>}
         */
        this.answers = {};
        this.messageEmitter = messageEmitter;
        this.messageEmitter.on("message", msg => this.readMessage(msg));
    }

    /**
     * @param {Buffer} buffer 
     */
    readMessage(buffer) {
        let header = buffer.readInt32LE();
        buffer = buffer.slice(4);

        if (header == -1) {
            this.emit("message", buffer);
            return;
        }
        
        if (header == -2) {
            let ansID = buffer.readInt32LE();
            let ans = this.answers[ansID];

            if (!ans) {
                ans = this.answers[ansID] = new Answer();
                setTimeout(() => delete this.answers[ansID], this.timeout);
            }

            ans.add(buffer.slice(4));

            if (ans.complete) {
                this.emit("message", ans.assemble(), ans.goldsource);
                delete this.answers[ansID];
            }
        }
    }
}

class SourceQuery {
    /**
     * @param {string} address 
     * @param {number} port 
     * @param {number} timeout 
     * @param {boolean} autoclose 
     */
    constructor(address, port, timeout = 1000, autoclose = true) {
        this.address = address;
        this.port = port;
        this.timeout = timeout;
        this.autoclose = autoclose;

        this.queries = 0;

        this.client = dgram.createSocket("udp4");
        this.client.on("error", () => {});
        this.client.on("close", () => this.client.closed = true);

        this.unpacker = new SQUnpacker(this.client, this.timeout);
    }

    queryEnded() {
        this.queries--;

        if (this.autoclose) setTimeout(() => this.close(), 250);
    }

    /**
     * @param {Buffer} buffer 
     * @param {string[]} responseCode 
     * @returns {Promise<{buffer: Buffer, header: string}>}
     */
    send(buffer, responseCode) {
        return new Promise((resolve, reject) => {
            this.queries++;

            this.client.send(buffer, 0, buffer.length, this.port, this.address, err => {
                if (err) {
                    this.queryEnded();
                    return reject(err);
                }

                let giveUpTimer = null;
                
                /**
                 * @param {Buffer} buffer 
                 * @param {boolean?} goldsource
                 */
                let relayResponse = (buffer, goldsource) => {
                    if (buffer.length < 1) return;

                    let header = String.fromCharCode(buffer[0]);
                    if (!responseCode.includes(header) && !goldsource) return;

                    this.unpacker.off("message", relayResponse);
                    clearTimeout(giveUpTimer);
                    
                    resolve({buffer: buffer.slice(1), header: header});
                    this.queryEnded();
                };
                
                giveUpTimer = setTimeout(() => {
                    this.unpacker.off("message", relayResponse);
                    reject(new Error("timeout"));
                    this.queryEnded();
                }, this.timeout);
                
                this.unpacker.on("message", relayResponse);
            });
        });
    }

    getInfo() {
        return new Promise((resolve, reject) => {
            let buffer = Buffer.alloc(25, 0xFF);
            buffer.writeInt8(ids.A2S_INFO.charCodeAt(0), 4);
            buffer.write("Source Engine Query\0", 5);

            this.send(buffer, [ids.S2A_INFO]).then(({ buffer }) => {
                let info = {
                    protocol: buffer.readInt8(),
                    name: Util.getString(buffer, 1),
                    map: "",
                    folder: "",
                    game: "",
                    appid: 0,
                    players: 0,
                    maxplayers: 0,
                    bots: 0,
                    servertype: "",
                    environment: "",
                    password: false,
                    vac: false
                };

                buffer = buffer.slice(1 + info.name.length + 1);

                info.map = Util.getString(buffer);
                info.folder = Util.getString(buffer, info.map.length + 1);
                info.game = Util.getString(buffer, info.map.length + info.folder.length + 2);

                buffer = buffer.slice(info.map.length + info.folder.length + info.game.length + 3);

                info.appid = buffer.readUInt16LE();
                info.players = buffer.readUInt8(2);
                info.maxplayers = buffer.readUInt8(3);
                info.bots = buffer.readUInt8(4);

                buffer = buffer.slice(5);

                info.servertype = String.fromCharCode(buffer.readInt8());
                info.environment = String.fromCharCode(buffer.readInt8(1));

                info.password = Boolean(buffer.readUInt8(2));
                info.vac = Boolean(buffer.readUInt8(3));

                buffer = buffer.slice(4);

                if (info.appid == 2400) {
                    info.ship = {
                        mode: buffer.readInt8(),
                        witnesses: buffer.readInt8(1),
                        duration: buffer.readInt8(2)
                    };
                    buffer = buffer.slice(3);
                }
                
                info.version = Util.getString(buffer);
                buffer = buffer.slice(info.version.length + 1);

                if (buffer.length > 1) {
                    let EDF = buffer.readInt8();
                    buffer = buffer.slice(1);
                    
                    if ((EDF & 0x80) !== 0) {
                        info.port = buffer.readInt16LE();
                        buffer = buffer.slice(2);
                    }
                    
                    if ((EDF & 0x10) !== 0) {
                        info.steamID = buffer.readBigInt64LE().toString();
                        buffer = buffer.slice(8);
                    }
                    
                    if ((EDF & 0x40) !== 0) {
                        info["tv-port"] = buffer.readInt16LE();
                        buffer = buffer.slice(2);
                        info["tv-name"] = Util.getString(buffer);
                        buffer = buffer.slice(info["tv-name"].length + 1);
                    }
                    
                    if ((EDF & 0x20) !== 0) {
                        info.keywords = Util.getString(buffer);
                        buffer = buffer.slice(info.keywords.length + 1);
                        info.keywords = info.keywords.trim();
                    }
                    
                    if ((EDF & 0x01) !== 0) {
                        info.gameID = buffer.readBigInt64LE().toString();
                        buffer = buffer.slice(8);
                    }
                }

                resolve(info);
            }, failed => reject(failed));
        });
    }

    getPlayers() {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            let attempts = 0;
            let data = null;

            do {
                data = await this._getPlayers().catch(() => {});
                attempts++;
            }
            while (attempts < 10 && !data);

            if (!data) reject(new Error("players timed out"));
            else resolve(data);
        });
    }

    /**
     * @returns {Promise<{}[]>}
     */
    _getPlayers() {
        return new Promise((resolve, reject) => {
            this.send(Util.createChallenge(ids.A2S_PLAYER), [ids.S2A_SERVERQUERY_GETCHALLENGE, ids.S2A_PLAYER]).then(data => {
                if (data.header == ids.S2A_SERVERQUERY_GETCHALLENGE) {
                    this.send(Util.createChallenge(ids.A2S_PLAYER, data.buffer.readInt32LE()), [ids.S2A_PLAYER]).then(player_data => {
                        resolve(Util.parsePlayerBuffer(player_data.buffer));
                    }, failed => reject(failed));
                }
                else if (data.header == ids.S2A_PLAYER) resolve(Util.parsePlayerBuffer(data.buffer));
                else reject(new Error("Invalid header @ getPlayers: " + data.header));
            }, failed => reject(failed));
        });
    }

    getRules() {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            let attempts = 0;
            let data = null;

            do {
                data = await this._getRules().catch(() => {});
                attempts++;
            }
            while (attempts < 10 && !data);

            if (!data) reject(new Error("rules timed out"));
            else resolve(data);
        });
    }

    _getRules() {
        return new Promise((resolve, reject) => {
            this.send(Util.createChallenge(ids.A2S_RULES), [ids.S2A_SERVERQUERY_GETCHALLENGE, ids.S2A_RULES]).then(data => {
                let header = data.header;
                let buffer = data.buffer;

                if (header == ids.S2A_SERVERQUERY_GETCHALLENGE) {
                    this.send(Util.createChallenge(ids.A2S_RULES, data.buffer.readInt32LE()), [ids.S2A_RULES]).then(rules_data => {
                        resolve(Util.parseRulesBuffer(rules_data.buffer));
                    }, failed => reject(failed));
                }
                else if (header == ids.S2A_RULES) {
                    return resolve(Util.parseRulesBuffer(buffer));
                }
                else reject(new Error("Invalid header @ getRules: " + header));
            }, failed => reject(failed));
        });
    }

    close() {
        if (this.queries == 0 && !this.client.closed) {
            this.client.close();
        }
    }
}

class Util {
    /**
    * @param {string[]} keys 
    * @param {any[]} values 
    */
    static combine(keys, values) {
        let pairs = {};
        for (let i = 0; i < values.length; i++) {
            pairs[keys[i]] = values[i];
        }
        return pairs;
    }

    /**
     * @param {Buffer} buffer 
     */
    static parsePlayerBuffer(buffer) {
        //we ignore the first byte (player count) because it is unreliable when there is more than 255 players
        let players = [];
        buffer = buffer.slice(1);

        while (buffer.length > 0) {
            let obj = { index: 0 };
            //index is broken
            buffer = buffer.slice(1);

            try {
                obj.name = Util.getString(buffer);
                buffer = buffer.slice(obj.name.length + 1);
    
                obj.score = buffer.readInt32LE();
                obj.online = buffer.readFloatLE(4);

                players.push(obj);
                players[players.length - 1].index = players.length - 1;

                buffer = buffer.slice(8);
            }
            catch (ex) { break; }
        }

        return players;
    }

    /**
     * @param {Buffer} buffer 
     */
    static parseRulesBuffer(buffer) {
        //we ignore first two bytes because they are useless
        let rules = {};
        buffer = buffer.slice(2);
        
        do {
            let key = Util.getString(buffer);
            if (!key) break;

            buffer = buffer.slice(key.length + 1);

            let val = Util.getString(buffer);
            buffer = buffer.slice(val.length + 1);

            rules[key] = val;
        }
        while (buffer.length > 0);

        return rules;
    }

    /**
     * @param {Buffer} buffer 
     */
    static getStringLength(buffer, offset = 0) {
        for (let i = offset; i < buffer.length; i++) {
            if (buffer[i] == 0) return i;
        }
        return -1;
    }

    /**
     * @param {Buffer} buffer 
     */
    static getString(buffer, offset = 0) {
        var length = this.getStringLength(buffer, offset);
        if (length == -1) return "";

        return buffer.toString(undefined, offset, length);
    }

    /**
     * @param {string} header 
     * @param {number?} challenge_number 
     */
    static createChallenge(header, challenge_number = undefined) {
        let buffer = Buffer.alloc(9, 0xFF);
        buffer.writeInt8(header.charCodeAt(), 4);

        if (challenge_number) buffer.writeInt32LE(challenge_number, 5);
        return buffer;
    }
}

module.exports = SourceQuery;