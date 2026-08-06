import mqtt from 'mqtt';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { speech } = req.body;
  if (!speech) {
    return res.status(400).json({ error: 'Missing speech input' });
  }

  try {
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          {
            role: 'system',
            content: 'You are a smart home automation controller. Interpret the user speech input. Respond strictly with a JSON object formatted as {"state": "ON"} or {"state": "OFF"}. If ambiguous, default to {"state": "OFF"}.'
          },
          {
            role: 'user',
            content: speech
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0
      })
    });

    const groqData = await groqResponse.json();
    const content = JSON.parse(groqData.choices[0].message.content);
    const command = content.state.toUpperCase();

    const mqttClient = mqtt.connect('mqtt://broker.hivemq.com:1883');

    await new Promise((resolve, reject) => {
      mqttClient.on('connect', () => {
        mqttClient.publish('myuniqueuser123/esp32/led', command, {}, (err) => {
          mqttClient.end();
          if (err) reject(err);
          else resolve();
        });
      });
      mqttClient.on('error', (err) => {
        mqttClient.end();
        reject(err);
      });
    });

    return res.status(200).json({ success: true, command, speech });

  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}