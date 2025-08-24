"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var supabase_js_1 = require("@supabase/supabase-js");
var node_fetch_1 = require("node-fetch");
var SUPABASE_URL = process.env.SUPABASE_URL;
var SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
var GOOGLE_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
var supabase = (0, supabase_js_1.createClient)(SUPABASE_URL, SUPABASE_KEY);
function getStandardizedAddress(venue) {
    return __awaiter(this, void 0, void 0, function () {
        var url, res, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    url = "https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=".concat(encodeURIComponent(venue), "&inputtype=textquery&fields=formatted_address,place_id,formatted_phone_number,website,rating&key=").concat(GOOGLE_API_KEY);
                    return [4 /*yield*/, (0, node_fetch_1.default)(url)];
                case 1:
                    res = _a.sent();
                    return [4 /*yield*/, res.json()];
                case 2:
                    data = (_a.sent());
                    if (data.candidates && data.candidates.length > 0) {
                        return [2 /*return*/, data.candidates[0].formatted_address || null];
                    }
                    return [2 /*return*/, null];
            }
        });
    });
}
function updateEventLocations() {
    return __awaiter(this, arguments, void 0, function (batchSize) {
        var _a, events, error, _i, events_1, event_1, address;
        if (batchSize === void 0) { batchSize = 10; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, supabase
                        .from('events')
                        .select('id, venue, location')
                        .is('location', null)];
                case 1:
                    _a = _b.sent(), events = _a.data, error = _a.error;
                    if (error)
                        throw error;
                    if (!events || events.length === 0) {
                        console.log('No events to update.');
                        return [2 /*return*/];
                    }
                    _i = 0, events_1 = events;
                    _b.label = 2;
                case 2:
                    if (!(_i < events_1.length)) return [3 /*break*/, 7];
                    event_1 = events_1[_i];
                    if (!event_1.venue) return [3 /*break*/, 6];
                    return [4 /*yield*/, getStandardizedAddress(event_1.venue)];
                case 3:
                    address = _b.sent();
                    if (!address) return [3 /*break*/, 5];
                    return [4 /*yield*/, supabase
                            .from('events')
                            .update({ location: address })
                            .eq('id', event_1.id)];
                case 4:
                    _b.sent();
                    console.log("Updated event ".concat(event_1.id, " with address: ").concat(address));
                    return [3 /*break*/, 6];
                case 5:
                    console.log("No address found for venue: ".concat(event_1.venue));
                    _b.label = 6;
                case 6:
                    _i++;
                    return [3 /*break*/, 2];
                case 7: return [2 /*return*/];
            }
        });
    });
}
updateEventLocations().catch(console.error);
