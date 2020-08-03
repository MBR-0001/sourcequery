const bp = require("bufferpack");
const dgram = require("dgram");
const EventEmitter = require("events");

const ids = {
    A2S_INFO: "T",
    S2A_INFO: "I",
    
    A2S_SERVERQUERY_GETCHALLENGE: "W",
    S2A_SERVERQUERY_GETCHALLENGE: "A",
    
    A2S_PLAYER: "U",
    S2A_PLAYER: "D",
    
    A2S_RULES: "V",
    S2A_RULES: "E"
};

class Answer {
    constructor() {
        this.compressed = false;
        this.parts = [];
        this.partsfound = 0;
    }

    /**
     * @param {Buffer} buffer 
     */
    add(buffer) {
        let head = bp.unpack("<ibbh", buffer);
        if ((head[0] & 0x80000000) !== 0) this.compressed = true;
        this.totalpackets = head[1];
        this.partsfound++;
        this.parts[head[2]] = buffer;
    }

    isComplete() {
        return this.partsfound == this.totalpackets;
    }

    assemble() {
        let combined = [];
        for (let i = 0; i < this.parts.length; i++) {
            let head = bp.unpack("<ibb", this.parts[i]);
            combined.push(this.parts[i].slice(head[2] == 1 ? 16 : 8));
        }
        let payload = Buffer.concat(combined).slice(4);
        return payload;
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
        let header = bp.unpack("<i", buffer)[0];
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
            
            if (ans.isComplete()) {
                this.emit("message", ans.assemble());
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
     */
    constructor(address, port, timeout = 1000, autoclose = true) {
        this.address = address;
        this.port = port;
        this.timeout = timeout;
        this.autoclose = autoclose;

        this.openQueries = 0;

        this.client = dgram.createSocket("udp4");
        this.client.on("error", () => {});
        this.client.on("close", () => this.client.closed = true);

        this.unpacker = new SQUnpacker(this.client, this.timeout);
    }

    queryEnded() {
        this.openQueries--;

        if (this.autoclose) setTimeout(() => this.close(), 250);
    }

    /**
     * @param {Buffer} buffer 
     * @param {string[]} responseCode 
     * @returns {Promise<{buffer: Buffer, header: string?}>}
     */
    send(buffer, responseCode) {
        return new Promise((resolve, reject) => {
            this.openQueries++;

            this.client.send(buffer, 0, buffer.length, this.port, this.address, err => {
                let giveUpTimer = null;
            
                if (err) {
                    this.queryEnded();
                    return reject(err);
                }
                
                /**
                 * @param {Buffer} buffer 
                 */
                let relayResponse = buffer => {
                    if (buffer.length < 1) return;

                    let header = String.fromCharCode(buffer[0]);
                    if (!responseCode.includes(header)) return;

                    this.unpacker.removeListener("message", relayResponse);
                    clearTimeout(giveUpTimer);
                    
                    resolve({buffer: buffer.slice(1), header: header});
                    this.queryEnded();
                };
                
                giveUpTimer = setTimeout(() => {
                    this.unpacker.removeListener("message", relayResponse);
                    reject("timeout");
                    this.queryEnded();
                }, this.timeout);
                
                this.unpacker.on("message", relayResponse);
            });
        });
    }

    getInfo() {
        return new Promise((resolve, reject) => {
            this.send(bp.pack("<isS", [-1, ids.A2S_INFO, "Source Engine Query"]), ids.S2A_INFO).then(({ buffer }) => {
                let infoArray = bp.unpack("<bSSSShBBBssBB", buffer);
                let info = Util.combine(["protocol", "name", "map", "folder", "game", "appid", "players", "maxplayers", "bots", "servertype", "environment", "password", "vac"], infoArray);
                
                let offset = bp.calcLength("<bSSSShBBBssBB", infoArray);
                buffer = buffer.slice(offset);
                
                info.version = bp.unpack("<S", buffer)[0];
                offset = bp.calcLength("<S", [info.version]);
                buffer = buffer.slice(offset);
                
                if (buffer.length > 1) {
                    offset = 0;
                    let EDF = bp.unpack("<b", buffer)[0];
                    offset += 1;
                    
                    if ((EDF & 0x80) !== 0) {
                        info.port = bp.unpack("<h", buffer, offset)[0];
                        offset += 2;
                    }
                    
                    if ((EDF & 0x10) !== 0) {
                        info.steamID = bp.unpack("<ii", buffer, offset)[0];
                        offset += 8;
                    }
                    
                    if ((EDF & 0x40) !== 0) {
                        let tvinfo = bp.unpack("<hS", buffer, offset);
                        info["tv-port"] = tvinfo[0];
                        info["tv-name"] = tvinfo[1];
                        offset += bp.calcLength("<hS", tvinfo);
                    }
                    
                    if ((EDF & 0x20) !== 0) {
                        info.keywords = bp.unpack("<S", buffer, offset)[0];
                        offset += bp.calcLength("<S", info.keywords);
                    }
                    
                    if ((EDF & 0x01) !== 0) {
                        info.gameID = bp.unpack("<i", buffer, offset)[0];
                        offset += 4;
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
            }
            while (attempts < 10 && !data);

            if (!data) reject("players timed out");
            else resolve(data);
        });
    }

    /**
     * @returns {Promise<{}[]>}
     */
    _getPlayers() {
        return new Promise((resolve, reject) => {
            this.send(bp.pack("<isi", [-1, ids.A2S_PLAYER, -1]), [ids.S2A_SERVERQUERY_GETCHALLENGE, ids.S2A_PLAYER]).then(data => {
                let header = data.header;
                let buffer = data.buffer;

                if (header == ids.S2A_SERVERQUERY_GETCHALLENGE) {
                    let key = bp.unpack("<i", buffer)[0];
                    this.send(bp.pack("<isi", [-1, ids.A2S_PLAYER, key]), ids.S2A_PLAYER).then(player_data => {
                        resolve(Util.parsePlayerBuffer(player_data.buffer));
                    }, failed => reject(failed));
                }
                else if (header == ids.S2A_PLAYER) {
                    return resolve(Util.parsePlayerBuffer(buffer));
                }
                else throw new Error("Invalid header @ getPlayers: " + header);
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
            }
            while (attempts < 10 && !data);

            if (!data) reject("rules timed out");
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
                    this.send(bp.pack("<isi", [-1, ids.A2S_RULES, key]), ids.S2A_RULES).then(rules_data => {
                        resolve(Util.parseRulesBuffer(rules_data.buffer));
                    }, failed => reject(failed));
                }
                else if (header == ids.S2A_RULES) {
                    return resolve(Util.parseRulesBuffer(buffer));
                }
                else throw new Error("Invalid header @ getRules: " + header);
            }, failed => reject(failed));
        });
    }

    close() {
        if (this.openQueries == 0) {
            if (this.client.closed) return;
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
        //we ignore the first byte because its just unreliable when there is more than 255 players
        let players = [];
        let offset = 1;
        do {
            let p = bp.unpack("<bSif", buffer, offset);
            if (!p) break;

            players.push(Util.combine(["index", "name", "score", "online"], p));
            offset += bp.calcLength("<bSif", p);
        }
        while (offset <= buffer.length);

        return players;
    }

    /**
     * @param {Buffer} buffer 
     */
    static parseRulesBuffer(buffer) {
        //we ignore the first byte because its just unreliable when there is more than 255 rules
        let rules = {};
        let offset = 2;

        while (offset <= buffer.length) {
            if (offset >= buffer.length) {
                //weird shit happens here idk y
                break;
            }

            let r = bp.unpack("<SS", buffer, offset);
            if (!r) break;

            rules[r[0]] = r[1];
            offset += bp.calcLength("<SS", r);
        }

        return rules;
    }
}

module.exports = SourceQuery;