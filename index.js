const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs').promises;
const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

// Config file
const CONFIG_FILE = 'config.json';
const LISTINGS_FILE = 'listings.json';

// Default config
const DEFAULT_CONFIG = {
    token: "YOUR_BOT_TOKEN_HERE",
    guildId: "1234567890",
    embedBuilderRoleId: "1234567890"
};

// Load or create config
async function initConfig() {
    try {
        await fs.access(CONFIG_FILE);
    } catch {
        await fs.writeFile(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
        console.log("Config file created. Please fill in the details.");
        process.exit(1);
    }
    return JSON.parse(await fs.readFile(CONFIG_FILE));
}

// Load or create listings
async function initListings() {
    try {
        await fs.access(LISTINGS_FILE);
        return JSON.parse(await fs.readFile(LISTINGS_FILE));
    } catch {
        await fs.writeFile(LISTINGS_FILE, JSON.stringify([]));
        return [];
    }
}

// Save listings
async function saveListings(listings) {
    await fs.writeFile(LISTINGS_FILE, JSON.stringify(listings, null, 2));
}

// Bot setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

let config;
let listings;

// Embed Builder Modal
function createEmbedBuilderModal(existingData = {}) {
    const modal = new ModalBuilder()
        .setCustomId('embed_builder_modal')
        .setTitle('Embed Builder');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('title')
                .setLabel('Title')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(existingData.title || '')
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('description')
                .setLabel('Description')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setValue(existingData.description || '')
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('fields')
                .setLabel('Fields (format: name:value|name:value)')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setValue(existingData.fields || '')
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('color')
                .setLabel('Color (hex, e.g. #5865F2)')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setValue(existingData.color || '#5865F2')
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('download_link')
                .setLabel('Download Link or File Path')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(existingData.download_link || '')
        )
    );

    return modal;
}

// Download Button Component
function createDownloadButton(listingId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`download_${listingId}`)
            .setLabel('Download')
            .setStyle(ButtonStyle.Primary)
    );
}

// Bot ready
client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);

    config = await initConfig();
    listings = await initListings();

    const guild = await client.guilds.fetch(config.guildId);
    const commands = [
        new SlashCommandBuilder()
            .setName('create_listing')
            .setDescription('Create a new download listing (requires embed builder perm)')
            .addRoleOption(option =>
                option.setName('required_role')
                    .setDescription('Role required to access this download (none for free)')
                    .setRequired(false)
            ),
        new SlashCommandBuilder()
            .setName('edit_listing')
            .setDescription('Edit an existing download listing (requires embed builder perm)')
            .addIntegerOption(option =>
                option.setName('listing_id')
                    .setDescription('The ID of the listing to edit')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('delete_listing')
            .setDescription('Delete a download listing (requires embed builder perm)')
            .addIntegerOption(option =>
                option.setName('listing_id')
                    .setDescription('The ID of the listing to delete')
                    .setRequired(true)
            ),
        new SlashCommandBuilder()
            .setName('list_listings')
            .setDescription('List all download listings'),
        new SlashCommandBuilder()
            .setName('set_listing_role')
            .setDescription('Set required role for a listing (requires embed builder perm)')
            .addIntegerOption(option =>
                option.setName('listing_id')
                    .setDescription('The ID of the listing')
                    .setRequired(true)
            )
            .addRoleOption(option =>
                option.setName('required_role')
                    .setDescription('Role required to access this download (none for free)')
                    .setRequired(false)
            )
    ];

    await guild.commands.set(commands);
});

// Interaction handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand() && !interaction.isModalSubmit() && !interaction.isButton()) return;

    const embedRole = await interaction.guild.roles.fetch(config.embedBuilderRoleId);

    // Command interactions
    if (interaction.isCommand()) {
        const { commandName } = interaction;

        if (commandName === 'create_listing') {
            if (!interaction.member.roles.cache.has(embedRole.id)) {
                await interaction.reply({ content: "You don't have permission to use the embed builder.", ephemeral: true });
                return;
            }

            const modal = createEmbedBuilderModal();
            await interaction.showModal(modal);
        }

        else if (commandName === 'edit_listing') {
            if (!interaction.member.roles.cache.has(embedRole.id)) {
                await interaction.reply({ content: "You don't have permission to use the embed builder.", ephemeral: true });
                return;
            }

            const listingId = interaction.options.getInteger('listing_id');
            const listing = listings.find(l => l.id === listingId);
            if (!listing) {
                await interaction.reply({ content: "Listing not found.", ephemeral: true });
                return;
            }

            const modal = createEmbedBuilderModal({
                title: listing.embed.title,
                description: listing.embed.description || '',
                fields: listing.embed.fields?.map(f => `${f.name}:${f.value}`).join('|') || '',
                color: `#${listing.embed.color.toString(16).padStart(6, '0')}`,
                download_link: listing.download_link
            });
            await interaction.showModal(modal);
            interaction.listingId = listingId; // Store for modal submit
        }

        else if (commandName === 'delete_listing') {
            if (!interaction.member.roles.cache.has(embedRole.id)) {
                await interaction.reply({ content: "You don't have permission.", ephemeral: true });
                return;
            }

            const listingId = interaction.options.getInteger('listing_id');
            const listingIndex = listings.findIndex(l => l.id === listingId);
            if (listingIndex === -1) {
                await interaction.reply({ content: "Listing not found.", ephemeral: true });
                return;
            }

            const listing = listings[listingIndex];
            if (listing.message_id && listing.channel_id) {
                try {
                    const channel = await client.channels.fetch(listing.channel_id);
                    const message = await channel.messages.fetch(listing.message_id);
                    await message.delete();
                } catch (error) {
                    console.log('Message not found or already deleted');
                }
            }

            listings.splice(listingIndex, 1);
            await saveListings(listings);
            await interaction.reply({ content: "Listing deleted.", ephemeral: true });
        }

        else if (commandName === 'list_listings') {
            if (!listings.length) {
                await interaction.reply({ content: "No listings found.", ephemeral: true });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle('Download Listings')
                .setColor(0x5865F2)
                .setFooter({ text: client.user.username, iconURL: client.user.displayAvatarURL() });

            for (const l of listings) {
                const roleText = l.required_role_id ? `Role ID: ${l.required_role_id}` : 'Free';
                embed.addFields({
                    name: `ID: ${l.id} - ${l.embed.title}`,
                    value: `${roleText} | Link: ${l.download_link}`
                });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        else if (commandName === 'set_listing_role') {
            if (!interaction.member.roles.cache.has(embedRole.id)) {
                await interaction.reply({ content: "You don't have permission.", ephemeral: true });
                return;
            }

            const listingId = interaction.options.getInteger('listing_id');
            const requiredRole = interaction.options.getRole('required_role');
            const listing = listings.find(l => l.id === listingId);

            if (!listing) {
                await interaction.reply({ content: "Listing not found.", ephemeral: true });
                return;
            }

            listing.required_role_id = requiredRole ? requiredRole.id : null;
            await saveListings(listings);
            await interaction.reply({ content: "Required role updated.", ephemeral: true });
        }
    }

    // Modal submit
    else if (interaction.isModalSubmit() && interaction.customId === 'embed_builder_modal') {
        await interaction.deferReply({ ephemeral: true });

        const title = interaction.fields.getTextInputValue('title');
        const description = interaction.fields.getTextInputValue('description');
        const fieldsInput = interaction.fields.getTextInputValue('fields');
        const colorInput = interaction.fields.getTextInputValue('color');
        const downloadLink = interaction.fields.getTextInputValue('download_link');

        // Parse color
        let color = 0x5865F2; // Default Discord blurple
        try {
            color = parseInt(colorInput.replace('#', ''), 16);
        } catch {}

        // Create embed
        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description || null)
            .setColor(color)
            .setFooter({ text: client.user.username, iconURL: client.user.displayAvatarURL() });

        // Parse fields
        if (fieldsInput) {
            const fields = fieldsInput.split('|').filter(f => f.includes(':')).map(field => {
                const [name, value] = field.split(':', 2);
                return { name: name.trim(), value: value.trim(), inline: false };
            });
            embed.addFields(fields);
        }

        // Check if editing or creating new
        if (interaction.listingId) {
            const listing = listings.find(l => l.id === interaction.listingId);
            if (!listing) {
                await interaction.followUp({ content: "Listing not found.", ephemeral: true });
                return;
            }

            listing.embed = embed.toJSON();
            listing.download_link = downloadLink;

            if (listing.message_id && listing.channel_id) {
                try {
                    const channel = await client.channels.fetch(listing.channel_id);
                    const message = await channel.messages.fetch(listing.message_id);
                    await message.edit({ embeds: [embed], components: [createDownloadButton(listing.id)] });
                } catch (error) {
                    console.log('Message not found or already deleted');
                }
            }

            await saveListings(listings);
            await interaction.followUp({ content: "Listing updated!", ephemeral: true });
        } else {
            const listingId = listings.length ? Math.max(...listings.map(l => l.id)) + 1 : 1;
            const requiredRole = interaction.options?.getRole('required_role');

            const listing = {
                id: listingId,
                embed: embed.toJSON(),
                download_link: downloadLink,
                required_role_id: requiredRole ? requiredRole.id : null,
                message_id: null,
                channel_id: interaction.channelId
            };

            const message = await interaction.channel.send({
                embeds: [embed],
                components: [createDownloadButton(listingId)]
            });

            listing.message_id = message.id;
            listings.push(listing);
            await saveListings(listings);
            await interaction.followUp({ content: "Listing created and posted!", ephemeral: true });
        }
    }

    // Button interaction
    else if (interaction.isButton() && interaction.customId.startsWith('download_')) {
        const listingId = parseInt(interaction.customId.split('_')[1]);
        const listing = listings.find(l => l.id === listingId);

        if (!listing) {
            await interaction.reply({ content: "Listing not found.", ephemeral: true });
            return;
        }

        if (listing.required_role_id && !interaction.member.roles.cache.has(listing.required_role_id)) {
            await interaction.reply({ content: "You don't have the required role to access this download.", ephemeral: true });
            return;
        }

        try {
            await fs.access(listing.download_link); // Check if file exists
            await interaction.user.send({ files: [listing.download_link] });
        } catch {
            await interaction.user.send({ content: listing.download_link }); // Send as link
        }

        await interaction.reply({ content: "Download sent to your DMs!", ephemeral: true });
    }
});

// Start bot
(async () => {
    config = await initConfig();
    await client.login(config.token);
})();