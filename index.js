require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const ROLES = require('./roles');

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers]
});

async function updateList() {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        await guild.members.fetch();
        const channel = await client.channels.fetch(process.env.CHANNEL_ID);

        let result = '';

        for (const roleData of ROLES) {
            const role = guild.roles.cache.get(roleData.id);
            if (!role) continue;

            const members = role.members.map(m => m.user.tag);
            if (!members.length) continue;

            result += `\n=== ${roleData.name} (${members.length}) ===\n`;
            result += members.join('\n') + '\n';
        }

        if (process.env.MESSAGE_ID) {
            try {
                const message = await channel.messages.fetch(process.env.MESSAGE_ID);
                await message.edit(result || 'Нет участников');
            } catch {
                const message = await channel.send(result || 'Нет участников');
                console.log('Создано новое сообщение:', message.id);
            }
        } else {
            const message = await channel.send(result || 'Нет участников');
            console.log('Скопируй MESSAGE_ID:', message.id);
        }

    } catch (err) {
        console.error('Ошибка:', err);
    }
}

client.once('ready', () => {
    console.log(`Бот запущен как ${client.user.tag}`);
    updateList();
    cron.schedule('0 0 * * *', () => updateList());
});

client.login(process.env.TOKEN);
