import mqtt from 'mqtt';

function parseVoiceCommand(speechText) {
  if (!speechText) return [{ state: 'off', durationMs: 0 }];

  const text = speechText.toLowerCase().trim();
  const sequence = [];
  const regex = /(turn\s+)?(on|off)(\s+for\s+(\d+)\s*(sec|second)s?)?/gi;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const action = match[2];
    const duration = match[4] ? parseInt(match[4], 10) * 1000 : 0;
    sequence.push({ state: action, durationMs: duration });
  }

  if (sequence.length === 0) {
    sequence.push({ state: text.includes('on') ? 'on' : 'off', durationMs: 0 });
  }

  return sequence;
}

export default async function handler(req, res) {
  // Extract speech from POST body
  const { speech } = req.body || {};
  const commands = parseVoiceCommand(speech);

  const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
  const mqttClient = mqtt.connect(brokerUrl);

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        mqttClient.end(true);
        reject(new Error('MQTT connection timeout'));
      }, 5000);

      mqttClient.on('connect', () => {
        mqttClient.publish(
          'myuniqueuser123_test_v2/esp32/led',
          JSON.stringify({ sequence: commands }),
          { qos: 0 },
          (err) => {
            clearTimeout(timeout);
            mqttClient.end(false, () => {
              if (err) reject(err);
              else resolve();
            });
          }
        );
      });

      mqttClient.on('error', (err) => {
        clearTimeout(timeout);
        mqttClient.end(true);
        reject(err);
      });
    });

    return res.status(200).json({ success: true, commands, speech });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}