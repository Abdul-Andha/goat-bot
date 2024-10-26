// commands/poll.js

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { Configuration, OpenAIApi } from 'openai';
import dotenv from 'dotenv';
dotenv.config();

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export const data = new SlashCommandBuilder()
  .setName('poll')
  .setDescription('Create a poll.')
  .addStringOption(option =>
    option
      .setName('question')
      .setDescription('The poll question.')
      .setRequired(true)
  )
  .addStringOption(option =>
    option
      .setName('options')
      .setDescription('Comma-separated options (max 10). Leave blank to auto-generate.')
      .setRequired(false)
  );

export async function execute(interaction) {
  const question = interaction.options.getString('question');
  const optionsInput = interaction.options.getString('options');
  await interaction.deferReply({ ephemeral: true });

  let options = [];

  if (optionsInput) {
    options = optionsInput.split(',').map(opt => opt.trim());
  } else {
    // Generate options using OpenAI
    try {
      const prompt = `Create 4 concise and distinct options for the following poll question:\n\n"${question}"\n\nList them separated by commas.`;

      const response = await openai.createChatCompletion({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 60,
        temperature: 0.7,
      });

      let generatedOptions = response.data.choices[0].message.content.trim();

      // Convert the generated options into an array
      options = generatedOptions.split(',').map(opt => opt.trim());

      // Content Moderation on options
      const moderationResponse = await openai.createModeration({
        input: options.join('\n'),
      });

      const [results] = moderationResponse.data.results;

      if (results.flagged) {
        await interaction.editReply('The generated options were flagged by content moderation. Please provide options manually.');
        return;
      }
    } catch (error) {
      console.error('Error generating poll options:', error);
      await interaction.editReply('An error occurred while generating poll options. Please provide options manually.');
      return;
    }
  }

  if (options.length < 2 || options.length > 10) {
    await interaction.editReply('Please provide between 2 and 10 options.');
    return;
  }

  const emojis = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣','9️⃣','🔟'];

  let description = '';
  options.forEach((option, index) => {
    description += `${emojis[index]} ${option}\n`;
  });

  const embed = new EmbedBuilder()
    .setColor(0x00FF00)
    .setTitle(`📊 ${question}`)
    .setDescription(description)
    .setFooter({ text: `Poll created by ${interaction.user.tag}` })
    .setTimestamp();

  try {
    // Send the poll message in the channel and tag @everyone
    const pollMessage = await interaction.channel.send({
      content: '@everyone A new poll has been created!',
      embeds: [embed],
    });

    // React with emojis for voting
    for (let i = 0; i < options.length; i++) {
      await pollMessage.react(emojis[i]);
    }

    // Confirm to the user that the poll has been created
    await interaction.editReply({ content: '✅ Your poll has been created and announced!', ephemeral: true });
  } catch (error) {
    console.error('Error creating poll:', error);
    await interaction.editReply('An error occurred while creating the poll.');
  }
}