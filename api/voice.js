import mqtt from 'mqtt';

// Simple parser for multi-step commands
function parseVoiceCommand(speechText) {
  const text = speechText.toLowerCase();
  const sequence = [];

  // Look for patterns like "turn [off/on] for [X] seconds"
  const regex = /(turn\s+)?(on|off)\s*(for\s*(\d+)\s*sec(ond)?s?)?/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const action = match[2]; // 'on' or 'off'
    const duration = match[4] ? parseInt(match[4], 10) * 1000 : 0; // Convert sec to ms

    sequence.push({ state: action, durationMs: duration });
  }

  // Fallback to a single command if regex didn't match cleanly
  if (sequence.length === 0) {
    sequence.push({ state: text.includes('on') ? 'on' : 'off', durationMs: 0 });
  }

  return sequence;
}

export default async function handler(req, res) {
  const { speech } = req.body; // e.g., "turn off for 5 seconds then turn on for 1 second"
  const commands = parseVoiceCommand(speech);

  const mqttClient = mqtt.connect(process.env.MQTT_BROKER_URL, {
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASSWORD,
  });

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        mqttClient.end(true);
        reject(new Error('MQTT connection timeout'));
      }, 5000);

      mqttClient.on('connect', () => {
        // Send payload as a JSON string sequence
        mqttClient.publish(
          'myuniqueuser123/esp32/led',
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