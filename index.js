require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder
} = require('discord.js');

const ROLES = require('./roles');

const UPDATE_INTERVAL_MS = Math.max(
    5000,
    Number(process.env.UPDATE_INTERVAL_MS || 30000)
);

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

function chunkArray(arr, size) {
    const result = [];
    for (let i = 0; i < arr.length; i += size) {
        result.push(arr.slice(i, i + size));
    }
    return result;
}

function getStatusEmoji(member) {
    const status = member.presence?.status || 'offline';
    if (status === 'online') return '🟢';
    if (status === 'idle') return '🟡';
    if (status === 'dnd') return '⛔';
    return '⚫';
}

function sortMembersByStatus(members) {
    const statusWeight = {
        online: 0,
        idle: 1,
        dnd: 2,
        offline: 3
    };

    return [...members].sort((a, b) => {
        const aStatus = a.presence?.status || 'offline';
        const bStatus = b.presence?.status || 'offline';

        const byStatus = (statusWeight[aStatus] ?? 99) - (statusWeight[bStatus] ?? 99);
        if (byStatus !== 0) return byStatus;

        return a.user.username.localeCompare(b.user.username, 'ru');
    });
}

async function generateEmbeds(guild) {
    await guild.members.fetch();
    await guild.roles.fetch();

    const configuredRoles = ROLES
        .map(roleData => ({
            ...roleData,
            role: guild.roles.cache.get(roleData.id)
        }))
        .filter(item => item.role)
        .sort((a, b) => b.role.position - a.role.position);

    const embeds = [];
    let currentEmbed = new EmbedBuilder()
        .setTitle('🏠 Состав семьи')
        .setColor(0x8B5CF6)
        .setDescription(
            [
                '🟢 Онлайн',
                '🟡 Отошёл',
                '⛔ Не беспокоить',
                '⚫ Оффлайн'
            ].join(' • ')
        )
        .setTimestamp()
        .setFooter({ text: `Автообновление каждые ${Math.floor(UPDATE_INTERVAL_MS / 1000)} сек.` });

    let fieldsInCurrentEmbed = 0;
    let totalMembers = 0;

    for (const item of configuredRoles) {
        const members = sortMembersByStatus(item.role.members.map(m => m));
        if (members.length === 0) continue;

        totalMembers += members.length;

        const lines = members.map(member => {
            const emoji = getStatusEmoji(member);
            return `${emoji} <@${member.id}>`;
        });

        const chunks = chunkArray(lines, 20);

        for (let i = 0; i < chunks.length; i++) {
            if (fieldsInCurrentEmbed >= 25) {
                embeds.push(currentEmbed);
                currentEmbed = new EmbedBuilder()
                    .setColor(0x8B5CF6)
                    .setTimestamp()
                    .setFooter({ text: `Автообновление каждые ${Math.floor(UPDATE_INTERVAL_MS / 1000)} сек.` });
                fieldsInCurrentEmbed = 0;
            }

            currentEmbed.addFields({
                name: i === 0
                    ? `${item.name} (${members.length})`
                    : `${item.name} — продолжение`,
                value: chunks[i].join('\n'),
                inline: false
            });

            fieldsInCurrentEmbed++;
        }
    }

    if (fieldsInCurrentEmbed === 0) {
        currentEmbed
            .setDescription('Нет участников в выбранных ролях.')
            .setFooter({ text: `Проверь ROLE_* переменные. Автообновление каждые ${Math.floor(UPDATE_INTERVAL_MS / 1000)} сек.` });
    }

    currentEmbed.setAuthor({ name: `Всего участников в списке: ${totalMembers}` });
    embeds.push(currentEmbed);

    return embeds;
}

async function updateMessage() {
    try {
        const guild = await client.guilds.fetch(process.env.GUILD_ID);
        const channel = await client.channels.fetch(process.env.CHANNEL_ID);

        const embeds = await generateEmbeds(guild);

        if (process.env.MESSAGE_ID) {
            try {
                const message = await channel.messages.fetch(process.env.MESSAGE_ID);
                await message.edit({ content: '', embeds });
            } catch {
                const message = await channel.send({ content: '', embeds });
                console.log('Скопируй MESSAGE_ID:', message.id);
            }
        } else {
            const message = await channel.send({ content: '', embeds });
            console.log('Скопируй MESSAGE_ID:', message.id);
        }
    } catch (err) {
        console.error('Ошибка обновления:', err);
    }
}

client.on('clientReady', async () => {
    console.log(`Бот запущен как ${client.user.tag}`);

    await updateMessage();

    setInterval(async () => {
        await updateMessage();
    }, UPDATE_INTERVAL_MS);
});

client.login(process.env.TOKEN);
