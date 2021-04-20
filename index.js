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

    assemble() {
        return Buffer.concat(this.parts).slice(4);
    }
}

class SQUnpacker extends EventEmitter {
    /**
     * @param {dgram.Socket} emitter 
     * @param {number} timeout 
     */
    constructor(emitter, timeout = 1000) {
        super();

        this.timeout = timeout;
        /**
         * @type {Record<string, Answer>}
         */
        this.answers = {};
        emitter.on("message", msg => this.readMessage(msg));
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
            let id = buffer.readInt32LE();
            let ans = this.answers[id];

            if (!ans) {
                ans = this.answers[id] = new Answer();
                setTimeout(() => delete this.answers[id], this.timeout);
            }

            ans.add(buffer.slice(4));

            if (ans.parts.filter(x => x).length == ans.totalpackets) {
                this.emit("message", ans.assemble(), ans.goldsource);
                delete this.answers[id];
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
        let _port = Number(port);

        if (!address || typeof address != "string") throw new Error("Invalid address");
        if (_port <= 0 || _port >= 65535 || isNaN(_port)) throw new Error("Invalid port");

        this.address = String(address);
        this.port = _port;
        this.timeout = Number(timeout);
        this.autoclose = Boolean(autoclose);

        this.queries = 0;

        this.client = dgram.createSocket("udp4");
        this.client.on("error", () => {});
        this.client.on("close", () => this.client.closed = true);
        this.unpacker = new SQUnpacker(this.client, this.timeout);
    }

    getInfo() {
        return this.getData(this._getInfo.bind(this));
    }

    getPlayers() {
        return this.getData(this._getPlayers.bind(this));
    }

    getRules() {
        return this.getData(this._getRules.bind(this));
    }

    /**
     * @param {Buffer} buffer 
     * @param {string[]} allowed_headers 
     * @returns {Promise<{buffer: Buffer, header: string}>}
     */
    send(buffer, allowed_headers) {
        return new Promise((resolve, reject) => {
            this.queries++;

            this.client.send(buffer, 0, buffer.length, this.port, this.address, err => {
                if (err) {
                    this.queryEnded();
                    return reject(err);
                }

                let timer = null;
                
                /**
                 * @param {Buffer} buffer 
                 * @param {boolean?} goldsource
                 */
                let handler = (buffer, goldsource) => {
                    if (buffer.length < 1) return;

                    let header = String.fromCharCode(buffer[0]);
                    if (!allowed_headers.includes(header) && !goldsource) return;

                    this.unpacker.off("message", handler);
                    clearTimeout(timer);
                    
                    resolve({buffer: buffer.slice(1), header: header});
                    this.queryEnded();
                };
                
                timer = setTimeout(() => {
                    this.unpacker.off("message", handler);
                    reject(new Error("timed out waiting for response from " + this.address));
                    this.queryEnded();
                }, this.timeout);
                
                this.unpacker.on("message", handler);
            });
        });
    }

    getData(request_fn) {
        // eslint-disable-next-line no-async-promise-executor
        return new Promise(async (resolve, reject) => {
            let attempts = 0;
            let data = null;

            do {
                data = await request_fn().catch(() => {});
                attempts++;
            }
            while (attempts < 10 && !data);

            if (!data) reject(new Error("timed out waiting for " + request_fn + " response from " + this.address));
            else resolve(data);
        });
    }

    _getData(challenge_fn, send_header, receive_header, parse_fn) {
        return new Promise((resolve, reject) => {
            this.send(challenge_fn(send_header), [ids.S2A_SERVERQUERY_GETCHALLENGE, receive_header]).then(data => {
                if (data.header == ids.S2A_SERVERQUERY_GETCHALLENGE) {
                    this.send(challenge_fn(send_header, data.buffer.readInt32LE()), [receive_header]).then(({ buffer }) => {
                        resolve(parse_fn(buffer));
                    }).catch(reject);
                }
                else if (data.header == receive_header) resolve(parse_fn(data.buffer));
                else reject(new Error("Invalid header for " + send_header +  ": " + data.header));
            }).catch(reject);
        });
    }

    _getInfo() {
        return this._getData(Util.createInfoChallenge, ids.A2S_INFO, ids.S2A_INFO, Util.parseInfoBuffer);
    }

    _getPlayers() {
        return this._getData(Util.createChallenge, ids.A2S_PLAYER, ids.S2A_PLAYER, Util.parsePlayerBuffer);
    }

    _getRules() {
        return this._getData(Util.createChallenge, ids.A2S_RULES, ids.S2A_RULES, Util.parseRulesBuffer);
    }

    queryEnded() {
        this.queries--;

        if (this.autoclose) setTimeout(() => this.close(), 250);
    }

    close() {
        if (this.queries == 0 && !this.client.closed) {
            this.client.close();
        }
    }

    static preflightCheck(address, port) {
        return new Promise((resolve, reject) => {
            let query = new SourceQuery(address, port);
            query.send(Util.createInfoChallenge(ids.A2S_INFO), [ids.S2A_INFO, ids.S2A_SERVERQUERY_GETCHALLENGE]).then(() => resolve()).catch(() => reject());
        });
    }
}

class Util {
    /**
     * @param {Buffer} buffer 
     */
    static parseInfoBuffer(buffer) {
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

        buffer = buffer.slice(1 + Util.byteLength(info.name));

        info.map = Util.getString(buffer);
        info.folder = Util.getString(buffer, Util.byteLength(info.map));
        info.game = Util.getString(buffer, Util.byteLength(info.map) + Util.byteLength(info.folder));

        buffer = buffer.slice(Util.byteLength(info.map) + Util.byteLength(info.folder) + Util.byteLength(info.game));

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
        buffer = buffer.slice(Util.byteLength(info.version));

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
                buffer = buffer.slice(Util.byteLength(info["tv-name"]));
            }
            
            if ((EDF & 0x20) !== 0) {
                info.keywords = Util.getString(buffer);
                buffer = buffer.slice(Util.byteLength(info.keywords));
            }
            
            if ((EDF & 0x01) !== 0) {
                info.gameID = buffer.readBigInt64LE().toString();
                buffer = buffer.slice(8);
            }
        }

        return info;
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
                buffer = buffer.slice(Util.byteLength(obj.name));
    
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

            buffer = buffer.slice(Util.byteLength(key));

            let val = Util.getString(buffer);
            buffer = buffer.slice(Util.byteLength(val));

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
        let length = this.getStringLength(buffer, offset);
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

    /**
     * @param {string} header
     * @param {number} challenge_number 
     */
    static createInfoChallenge(header, challenge_number = undefined) {
        let buffer = Buffer.alloc(challenge_number ? 29 : 25, 0xFF);
        
        buffer.writeInt8(header.charCodeAt(), 4);
        buffer.write("Source Engine Query\0", 5);

        if (challenge_number) buffer.writeInt32LE(challenge_number, 25);
        return buffer;
    }

    /**
     * @param {string} str 
     */
    static byteLength(str) {
        return Buffer.byteLength(str) + 1;
    }
}

module.exports = SourceQuery;