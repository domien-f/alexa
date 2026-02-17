'use strict';

const Alexa = require('ask-sdk-core');
const https = require('https');
const crypto = require('crypto');

// -- Hardcoded config (private skill) --
process.env.NIGHTSCOUT_URL = 'https://nightscout.drippycat.lol';

// ---------------------------------------------------------------------------
// Nightscout helpers
// ---------------------------------------------------------------------------

function buildNightscoutOptions() {
  const baseUrl = (process.env.NIGHTSCOUT_URL || '').replace(/\/+$/, '');
  if (!baseUrl) throw new Error('NIGHTSCOUT_URL is not configured.');

  const url = new URL('/api/v1/entries.json?count=1', baseUrl);
  const headers = {};

  const token = process.env.NIGHTSCOUT_TOKEN;
  if (token) {
    const mode = (process.env.NIGHTSCOUT_AUTH_MODE || 'bearer').toLowerCase();
    if (mode === 'apisecret_sha1') {
      headers['api-secret'] = crypto.createHash('sha1').update(token).digest('hex');
    } else {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return { url, headers };
}

function fetchLatestEntry() {
  return new Promise((resolve, reject) => {
    const { url, headers } = buildNightscoutOptions();

    const options = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: 'GET',
      headers: { ...headers, 'Accept': 'application/json' },
    };

    const proto = url.protocol === 'http:' ? require('http') : https;

    const req = proto.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
          return reject(new Error('Nightscout authentication failed. Check your token.'));
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Nightscout returned status ${res.statusCode}.`));
        }
        try {
          const data = JSON.parse(body);
          if (!Array.isArray(data) || data.length === 0) {
            return reject(new Error('No glucose entries returned from Nightscout.'));
          }
          resolve(data[0]);
        } catch (e) {
          reject(new Error('Could not parse Nightscout response.'));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Network error: ${e.message}`)));
    req.setTimeout(8000, () => { req.destroy(); reject(new Error('Nightscout request timed out.')); });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Glucose formatting
// ---------------------------------------------------------------------------

const DIRECTION_MAP = {
  DoubleUp:        'rising fast',
  SingleUp:        'rising',
  FortyFiveUp:     'rising slightly',
  Flat:            'steady',
  FortyFiveDown:   'falling slightly',
  SingleDown:      'falling',
  DoubleDown:      'falling fast',
  'NOT COMPUTABLE': '',
  RATE_OUT_OF_RANGE: '',
};

function spokenDirection(direction) {
  if (!direction) return '';
  return DIRECTION_MAP[direction] || direction.toLowerCase();
}

function convertValue(mgdl) {
  const units = (process.env.UNITS || 'mgdl').toLowerCase();
  if (units === 'mmol') {
    return { value: (mgdl / 18).toFixed(1), unit: 'millimoles per litre' };
  }
  return { value: String(Math.round(mgdl)), unit: 'milligrams per decilitre' };
}

function minutesAgo(entry) {
  const ts = entry.date || new Date(entry.dateString).getTime();
  return Math.round((Date.now() - ts) / 60000);
}

function buildSpeech(entry) {
  const { value, unit } = convertValue(entry.sgv);
  const dir = spokenDirection(entry.direction);
  const ago = minutesAgo(entry);

  let speech = `Your glucose is ${value} ${unit}`;
  if (dir) speech += ` and ${dir}`;
  speech += '.';

  if (ago > 15) {
    speech += ` But heads up, this reading is ${ago} minutes old.`;
  }

  return speech;
}

// ---------------------------------------------------------------------------
// Intent handlers
// ---------------------------------------------------------------------------

const LaunchRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'LaunchRequest';
  },
  handle(handlerInput) {
    const speech = 'Welcome to Glucose Monitor. You can say "what is my glucose" to get your latest reading.';
    return handlerInput.responseBuilder
      .speak(speech)
      .reprompt('Try saying: what is my glucose?')
      .getResponse();
  },
};

const GetGlucoseIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'GetGlucoseIntent'
    );
  },
  async handle(handlerInput) {
    console.log('GetGlucoseIntent invoked');
    try {
      const entry = await fetchLatestEntry();
      console.log('Nightscout entry:', JSON.stringify(entry));
      const speech = buildSpeech(entry);
      return handlerInput.responseBuilder.speak(speech).getResponse();
    } catch (err) {
      console.error('Nightscout fetch error:', err);
      return handlerInput.responseBuilder
        .speak('Sorry, I could not get your glucose reading right now. Please try again later.')
        .getResponse();
    }
  },
};

const HelpIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.HelpIntent'
    );
  },
  handle(handlerInput) {
    const speech = 'You can say "what is my glucose" and I will read your latest Nightscout value. What would you like to do?';
    return handlerInput.responseBuilder.speak(speech).reprompt(speech).getResponse();
  },
};

const CancelAndStopIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      ['AMAZON.CancelIntent', 'AMAZON.StopIntent'].includes(
        Alexa.getIntentName(handlerInput.requestEnvelope)
      )
    );
  },
  handle(handlerInput) {
    return handlerInput.responseBuilder.speak('Goodbye!').getResponse();
  },
};

const FallbackIntentHandler = {
  canHandle(handlerInput) {
    return (
      Alexa.getRequestType(handlerInput.requestEnvelope) === 'IntentRequest' &&
      Alexa.getIntentName(handlerInput.requestEnvelope) === 'AMAZON.FallbackIntent'
    );
  },
  handle(handlerInput) {
    const speech = "I didn't understand that. Try saying: what is my glucose?";
    return handlerInput.responseBuilder.speak(speech).reprompt(speech).getResponse();
  },
};

const SessionEndedRequestHandler = {
  canHandle(handlerInput) {
    return Alexa.getRequestType(handlerInput.requestEnvelope) === 'SessionEndedRequest';
  },
  handle(handlerInput) {
    const { reason, error } = handlerInput.requestEnvelope.request;
    if (error) console.error('Session ended with error:', JSON.stringify(error));
    else console.log('Session ended:', reason);
    return handlerInput.responseBuilder.getResponse();
  },
};

const ErrorHandler = {
  canHandle() { return true; },
  handle(handlerInput, error) {
    console.error('Unhandled error:', error.message, error.stack);
    return handlerInput.responseBuilder
      .speak('Sorry, something went wrong. Please try again.')
      .getResponse();
  },
};

// ---------------------------------------------------------------------------
// Skill builder
// ---------------------------------------------------------------------------

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(
    LaunchRequestHandler,
    GetGlucoseIntentHandler,
    HelpIntentHandler,
    CancelAndStopIntentHandler,
    FallbackIntentHandler,
    SessionEndedRequestHandler,
  )
  .addErrorHandlers(ErrorHandler)
  .lambda();
