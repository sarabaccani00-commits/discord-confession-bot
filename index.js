// Importa le librerie essenziali
require('dotenv').config();
const { Client, GatewayIntentBits, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, SlashCommandBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');

// Legge gli ID e il Token dal file .env
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_SETUP_ID = process.env.CHANNEL_SETUP_ID;         // Canale dove si trova il pulsante di confessione
const CHANNEL_MOD_REVIEW_ID = process.env.CHANNEL_MOD_REVIEW_ID; // Canale dove arriva la richiesta di revisione
const CHANNEL_PUBLIC_CONFESSION_ID = process.env.CHANNEL_PUBLIC_CONFESSION_ID; // Canale dove viene pubblicata la confessione ANONIMA
const CHANNEL_MOD_LOG_ID = process.env.CHANNEL_MOD_LOG_ID;     // Canale per il registro delle azioni dei mod
const ANON_AVATAR_URL = process.env.ANON_AVATAR_URL;   
const ROLE_MOD_ID = process.env.ROLE_MOD_ID;           

// Inizializza il client di Discord con gli intent necessari
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ----------------------------------------------------
// EVENTO: Bot connesso e registrazione comandi
// ----------------------------------------------------
client.once('ready', async () => {
    console.log(`🤖 Bot delle Confessioni connesso come ${client.user.tag}`);

    const commands = [
        new SlashCommandBuilder()
            .setName('setupconfessioni')
            .setDescription('Configura il messaggio con il bottone per l\'invio delle confessioni.')
            .setDefaultMemberPermissions(0) 
    ];

    try {
        await client.application.commands.set(commands);
        console.log('✅ Comando Slash /setupconfessioni registrato.');
    } catch (error) {
        console.error('Errore durante la registrazione dei comandi slash:', error);
    }
});

// ----------------------------------------------------
// INTERAZIONE: Gestione del Comando Slash /setupconfessioni (Crea il bottone principale)
// ----------------------------------------------------
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'setupconfessioni') {
        // Verifica preliminare degli ID critici 
        if (!CHANNEL_SETUP_ID || !CHANNEL_MOD_REVIEW_ID || !CHANNEL_PUBLIC_CONFESSION_ID || !ROLE_MOD_ID) {
            return interaction.reply({ content: 'ERRORE: Controlla che tutti i 4 ID e il Ruolo Mod siano configurati correttamente nel file .env!', ephemeral: true });
        }
        
        // Verifica che il comando sia usato nel canale SETUP designato
        if (interaction.channelId !== CHANNEL_SETUP_ID) {
             return interaction.reply({ content: `Questo comando deve essere usato nel canale designato per il pulsante: <#${CHANNEL_SETUP_ID}>`, ephemeral: true });
        }


        const button = new ButtonBuilder()
            .setCustomId('confession_button')
            .setLabel('Confessa Qui Anonimamente') 
            .setStyle(ButtonStyle.Secondary);

        const row = new ActionRowBuilder().addComponents(button);

        const embed = new EmbedBuilder()
            .setColor(0x2B2D31)
            .setTitle('💬 Scrivi una Confessione Anonima')
            .setDescription('Clicca il bottone qui sotto per inviare un messaggio al server in modo completamente anonimo. I moderatori devono prima approvare.')
            .setImage(ANON_AVATAR_URL);

        await interaction.channel.send({
            embeds: [embed],
            components: [row]
        });

        return interaction.reply({ content: 'Messaggio di setup inviato con successo!', ephemeral: true });
    }
});

// ----------------------------------------------------
// INTERAZIONE: Gestione del Bottone "Confessa Qui Anonimamente" (Apertura Modal)
// ----------------------------------------------------
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || interaction.customId !== 'confession_button') return;

    // 1. Crea la Modal
    const modal = new ModalBuilder()
        .setCustomId('confession_modal')
        .setTitle('Invia la Tua Confessione Anonima');

    // 2. Crea il campo di testo (Max 1000 caratteri di contenuto, etichetta Max 45)
    const confessionInput = new TextInputBuilder()
        .setCustomId('confession_text')
        .setLabel("Scrivi la tua confessione (Max 104 caratteri)")
        .setStyle(TextInputStyle.Paragraph)
        .setMinLength(10)
        .setMaxLength(104)
        .setRequired(true);

    // 3. Aggiungi il campo alla Modal
    const firstActionRow = new ActionRowBuilder().addComponents(confessionInput);
    modal.addComponents(firstActionRow);

    // 4. Mostra la Modal all'utente
    await interaction.showModal(modal);
});


// ----------------------------------------------------
// INTERAZIONE: Gestione dell'Invio della Modal (Invio alla Revisione)
// ----------------------------------------------------
client.on('interactionCreate', async interaction => {
    if (!interaction.isModalSubmit() || interaction.customId !== 'confession_modal') return;

    const confessionText = interaction.fields.getTextInputValue('confession_text');
    const userId = interaction.user.id;
    const modReviewChannel = client.channels.cache.get(CHANNEL_MOD_REVIEW_ID);

    if (!modReviewChannel) {
        return interaction.reply({ content: 'Si è verificato un errore: Canale di revisione non trovato.', ephemeral: true });
    }

    // Crea l'Embed per la revisione (visibile solo ai mod - CON ID per la sicurezza)
    const reviewEmbed = new EmbedBuilder()
        .setTitle('🚨 NUOVA CONFESSIONE - Revisione')
        .setDescription(`**Contenuto:**\n${confessionText}`)
        .setColor(0xFFD700) 
        .addFields(
            { name: 'Utente ID', value: userId, inline: true },
            { name: 'Tag Utente', value: interaction.user.tag, inline: true }
        )
        .setTimestamp();

    // Pulsanti di Revisione (Accetta e Rifiuta)
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`approve_${userId}`) 
                .setLabel('✅ Accetta')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`reject_${userId}`)
                .setLabel('❌ Rifiuta')
                .setStyle(ButtonStyle.Danger)
        );

    // Invia al canale di revisione/moderazione
    await modReviewChannel.send({
        embeds: [reviewEmbed],
        components: [row]
    });
    
    // Risposta all'utente
    return interaction.reply({
        content: '✅ La tua confessione è stata inviata per la revisione. Se approvata, sarà pubblicata anonimamente!',
        ephemeral: true
    });
});

// ----------------------------------------------------
// INTERAZIONE: Gestione dei Pulsanti di Revisione (Accetta/Rifiuta)
// ----------------------------------------------------
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || (!interaction.customId.startsWith('approve_') && !interaction.customId.startsWith('reject_'))) return;

    // 1. Verifica Ruolo Moderatore
    const member = interaction.guild.members.cache.get(interaction.user.id);
    if (!member.roles.cache.has(ROLE_MOD_ID)) {
        return interaction.reply({ content: 'Non hai l\'autorizzazione per gestire le confessioni.', ephemeral: true });
    }
    
    const [action, originalUserId] = interaction.customId.split('_');
    const originalEmbed = interaction.message.embeds[0];
    const confessionText = originalEmbed.description.replace('**Contenuto:**\n', '');
    const publicConfessionChannel = client.channels.cache.get(CHANNEL_PUBLIC_CONFESSION_ID); // Canale di pubblicazione finale
    const modLogChannel = client.channels.cache.get(CHANNEL_MOD_LOG_ID);

    // Controlla se il log è disponibile
    if (!modLogChannel) {
        console.error(`Canale log non trovato: ${CHANNEL_MOD_LOG_ID}`);
    }

    // --- AZIONE DI RIFIUTO (Non viene pubblicato nulla) ---
    if (action === 'reject') {
        const logEmbed = new EmbedBuilder()
            .setTitle('❌ CONFESSIONE RIFIUTATA')
            .setDescription(`**Contenuto:**\n${confessionText}`)
            .setColor('Red')
            .addFields(
                { name: 'Gestita da', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
                { name: 'Autore Originale ID', value: originalUserId, inline: false }
            )
            .setTimestamp();

        if (modLogChannel) await modLogChannel.send({ embeds: [logEmbed] }); // Invia il log
        
        await interaction.message.delete(); // Cancella il messaggio di revisione
        return interaction.reply({ content: `❌ Confessione rifiutata e loggata.`, ephemeral: true });
    }

    // --- AZIONE DI ACCETTAZIONE (Pubblicazione Anonima tramite Webhook) ---
    if (action === 'approve') {
        if (!publicConfessionChannel) {
            return interaction.reply({ content: 'Errore interno: Canale di pubblicazione finale non trovato.', ephemeral: true });
        }
        
        try {
            // 2. Creazione Webhook Temporaneo nel canale di pubblicazione finale
            const webhook = await publicConfessionChannel.createWebhook({
                name: 'Confessione Anonima', 
                avatar: ANON_AVATAR_URL,
                reason: `Pubblicazione confessione ID: ${originalUserId}`
            });
            
            // 3. Invio Anonimo: NESSUN ID O NOME IN QUESTO MESSAGGIO
            await webhook.send({
                content: confessionText, 
                username: 'Confessione Anonima',
                avatarURL: ANON_AVATAR_URL,
            });

            // 4. Pulizia
            await webhook.delete(); // Elimina il Webhook dopo l'uso
            await interaction.message.delete(); // Elimina il messaggio di revisione
            
            // Log dopo il successo
            const logEmbed = new EmbedBuilder()
                .setTitle('✅ CONFESSIONE PUBBLICATA')
                .setDescription(`**Contenuto:**\n${confessionText}`)
                .setColor('Green')
                .addFields(
                    { name: 'Gestita da', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
                    { name: 'Autore Originale ID', value: originalUserId, inline: false }
                )
                .setTimestamp();
            
            if (modLogChannel) await modLogChannel.send({ embeds: [logEmbed] }); // Invia il log
            
            return interaction.reply({ content: `✅ Confessione pubblicata anonimamente e loggata.`, ephemeral: true });
            
        } catch (error) {
            console.error('Errore durante la creazione/invio Webhook:', error);
            return interaction.reply({ content: 'Errore: Non sono riuscito a pubblicare (Controlla il permesso "Gestisci Webhook" e l\'URL dell\'avatar nel .env).', ephemeral: true });
        }
    }
});

client.login(BOT_TOKEN);