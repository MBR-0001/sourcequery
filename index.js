const bp = require("bufferpack");
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
            let head = bp.unpack("<ibbh", buffer);

            let number = head[2];

            if (number < 0 || number != this.parts.length) {
                this.goldsource = true;
                return this.add(buffer);
            }

            if (this.totalpackets == undefined) this.totalpackets = head[1];
    
            this.parts[number] = buffer.slice(bp.calcLength("<ibbh", head));
        }
        
        else {
            //Upper 4 bits represent the number of the current packet (starting at 0) and bottom 4 bits represent the total number of packets (2 to 15).
            let head = bp.unpack("<ib", buffer);

            let number = (head[1] & 240) / 16;
            let total = head[1] & 15;

            if (this.totalpackets == undefined) this.totalpackets = total;

            this.parts[number] = buffer.slice(bp.calcLength("<ib", head));
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
        //this causes an exception every now and then, idk why
        let unpacked = bp.unpack("<i", buffer);
        if (!unpacked) return;

        let header = unpacked[0];
        buffer = buffer.slice(4);

        if (header == -1) {
            this.emit("message", buffer);
            return;
        }
        
        if (header == -2) {
            let ansID = bp.unpack("<i", buffer)[0];
            let ans = this.answers[ansID];

            if (!ans) {
                ans = this.answers[ansID] = new Answer();
                setTimeout(() => delete this.answers[ansID], this.timeout);
            }

            ans.add(buffer);

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
            this.send(bp.pack("<isS", [-1, ids.A2S_INFO, "Source Engine Query"]), [ids.S2A_INFO]).then(({ buffer }) => {
                let infoArray = bp.unpack("<bSSSShBBBssBB", buffer);
                let info = Util.combine(["protocol", "name", "map", "folder", "game", "appid", "players", "maxplayers", "bots", "servertype", "environment", "password", "vac"], infoArray);
                
                info.password = Boolean(info.password);
                info.vac = Boolean(info.vac);

                buffer = buffer.slice(bp.calcLength("<bSSSShBBBssBB", infoArray));

                if (info.appid == 2400) {
                    info.ship = Util.combine(["mode", "witnesses", "duration"], bp.unpack("<bbb", buffer));
                    buffer = buffer.slice(3);
                }
                
                info.version = bp.unpack("<S", buffer)[0];
                buffer = buffer.slice(bp.calcLength("<S", [info.version]));

                if (buffer.length > 1) {
                    let EDF = bp.unpack("<b", buffer)[0];
                    buffer = buffer.slice(1);
                    
                    if ((EDF & 0x80) !== 0) {
                        info.port = bp.unpack("<h", buffer)[0];
                        buffer = buffer.slice(2);
                    }
                    
                    if ((EDF & 0x10) !== 0) {
                        info.steamID = bp.unpack("<ii", buffer)[0];
                        buffer = buffer.slice(8);
                    }
                    
                    if ((EDF & 0x40) !== 0) {
                        let tvinfo = bp.unpack("<hS", buffer);
                        info["tv-port"] = tvinfo[0];
                        info["tv-name"] = tvinfo[1];
                        buffer = buffer.slice(bp.calcLength("<hS", tvinfo));
                    }
                    
                    if ((EDF & 0x20) !== 0) {
                        info.keywords = bp.unpack("<S", buffer)[0];
                        buffer = buffer.slice(bp.calcLength("<S", [info.keywords]));
                        info.keywords = info.keywords.trim();
                    }
                    
                    if ((EDF & 0x01) !== 0) {
                        info.gameID = bp.unpack("<ii", buffer)[0];
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
            this.send(bp.pack("<isi", [-1, ids.A2S_PLAYER, -1]), [ids.S2A_SERVERQUERY_GETCHALLENGE, ids.S2A_PLAYER]).then(data => {
                if (data.header == ids.S2A_SERVERQUERY_GETCHALLENGE) {
                    let key = bp.unpack("<i", data.buffer)[0];
                    this.send(bp.pack("<isi", [-1, ids.A2S_PLAYER, key]), [ids.S2A_PLAYER]).then(player_data => {
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
            this.send(bp.pack("<isi", [-1, ids.A2S_RULES, -1]), [ids.S2A_SERVERQUERY_GETCHALLENGE, ids.S2A_RULES]).then(data => {
                let header = data.header;
                let buffer = data.buffer;

                if (header == ids.S2A_SERVERQUERY_GETCHALLENGE) {
                    let key = bp.unpack("<i", buffer)[0];
                    this.send(bp.pack("<isi", [-1, ids.A2S_RULES, key]), [ids.S2A_RULES]).then(rules_data => {
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

        do {
            let p = bp.unpack("<bSif", buffer);
            if (!p) break;

            players.push(Util.combine(["index", "name", "score", "online"], p));
            players[players.length - 1].index = players.length - 1;
            buffer = buffer.slice(bp.calcLength("<bSif", p));
        }
        while (buffer.length > 0);

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
            let r = bp.unpack("<SS", buffer);
            if (!r) break;

            rules[r[0]] = r[1];
            buffer = buffer.slice(bp.calcLength("<SS", r));
        }
        while (buffer.length > 0);

        return rules;
    }
}

module.exports = SourceQuery;