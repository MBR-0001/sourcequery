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

        console.log(header);

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

        this.squnpacker = new SQUnpacker(this.client, this.timeout);
    }

    queryEnded() {
        this.openQueries--;

        if (this.autoclose) setTimeout(() => this.close(), 250);
    }

    /**
     * @param {Buffer} buffer 
     * @param {string} responseCode 
     * @returns {Promise<Buffer>}
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
                
                let relayResponse = buffer => {
                    if (buffer.length < 1) return;
                    console.log(bp.unpack("<s", buffer)[0]);
                    if (bp.unpack("<s", buffer)[0] !== responseCode) return;
                    
                    this.squnpacker.removeListener("message", relayResponse);
                    clearTimeout(giveUpTimer);
                    
                    resolve(buffer.slice(1));
                    this.queryEnded();
                };
                
                giveUpTimer = setTimeout(() => {
                    this.squnpacker.removeListener("message", relayResponse);
                    reject("timeout");
                    this.queryEnded();
                }, this.timeout);
                
                this.squnpacker.on("message", relayResponse);
            });
        });
    }

    /**
     * @param {string} reqType 
     * @returns {Promise<number>}
     */
    getChallengeKey(reqType) {
        return new Promise((resolve, reject) => {
            this.send(bp.pack("<isi", [-1, reqType, -1]), ids.S2A_SERVERQUERY_GETCHALLENGE).then(buffer => {
                resolve(bp.unpack("<i", buffer)[0]);
            }, failed => reject(failed));
        });
    }

    /**
     * @param {string[]} keys 
     * @param {any[]} values 
     */
    combine(keys, values) {
        let pairs = {};
        for (let i = 0; i < values.length; i++) {
            pairs[keys[i]] = values[i];
        }
        return pairs;
    }

    getInfo() {
        return new Promise((resolve, reject) => {
            this.send(bp.pack("<isS", [-1, ids.A2S_INFO, "Source Engine Query"]), ids.S2A_INFO).then(buffer => {
                let infoArray = bp.unpack("<bSSSShBBBssBB", buffer);
                let info = this.combine(["protocol", "name", "map", "folder", "game", "appid", "players", "maxplayers", "bots", "servertype", "environment", "password", "vac"], infoArray);
                
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
        return new Promise((resolve, reject) => {
            this.getChallengeKey(ids.A2S_PLAYER).then(key => {
                this.send(bp.pack("<isi", [-1, ids.A2S_PLAYER, key]), ids.S2A_PLAYER).then(buffer => {
                    let playerCount = bp.unpack("<b", buffer)[0];
                    let players = [];
                    let offset = 1;
                    for (let i = 0; i < playerCount; i++) {
                        let p = bp.unpack("<bSif", buffer, offset);
                        players.push(this.combine(["index", "name", "score", "online"], p));
                        offset += bp.calcLength("<bSif", p);
                    }
                    resolve(players);
                }, failed => reject(failed));
            }, failed => reject(failed));
        });
    }

    getRules() {
        return new Promise((resolve, reject) => {
            this.getChallengeKey(ids.A2S_RULES).then(key => {
                this.send(bp.pack("<isi", [-1, ids.A2S_RULES, key]), ids.S2A_RULES).then(buffer => {
                    let ruleCount = bp.unpack("<h", buffer)[0];
                    let rules = {};
                    let offset = 2;
                    for (let i = 0; i < ruleCount; i++) {
                        let r = bp.unpack("<SS", buffer, offset);
                        rules[r[0]] = r[1];
                        offset += bp.calcLength("<SS", r);
                    }
                    resolve(rules);
                }, failed => reject(failed));
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

module.exports = SourceQuery;