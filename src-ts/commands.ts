import type { CommandGuildLike, CommandJson } from './types';

const commandsJs = require('../commands') as {
  buildCommands(): CommandJson[];
  getCommandsSignature(commands?: CommandJson[]): string;
  registerCommands(guild: CommandGuildLike, commands?: CommandJson[]): Promise<CommandJson[]>;
};

export const buildCommands = commandsJs.buildCommands;
export const getCommandsSignature = commandsJs.getCommandsSignature;
export const registerCommands = commandsJs.registerCommands;

export type { CommandGuildLike, CommandJson };
