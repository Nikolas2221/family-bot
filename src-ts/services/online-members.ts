const STATUS_LABELS: Record<string, string> = {
  online: '🟢',
  idle: '🟡',
  dnd: '🔴'
};

export async function buildDiscordOnlineMembersText(guild: any): Promise<string> {
  await guild.members.fetch({ withPresences: true }).catch(() => null);
  const members = [...guild.members.cache.values()]
    .filter((member: any) => !member.user?.bot && STATUS_LABELS[member.presence?.status])
    .sort((left: any, right: any) => {
      const order: Record<string, number> = { online: 0, idle: 1, dnd: 2 };
      return (order[left.presence?.status] ?? 9) - (order[right.presence?.status] ?? 9)
        || String(left.displayName || left.user?.username).localeCompare(String(right.displayName || right.user?.username), 'ru');
    });

  if (!members.length) return 'Сейчас участники со статусом online, idle или dnd не найдены.';
  const visible = members.slice(0, 50);
  const lines = visible.map((member: any, index: number) => {
    const status = STATUS_LABELS[member.presence.status];
    const name = String(member.displayName || member.user?.globalName || member.user?.username || member.id).slice(0, 80);
    return `${index + 1}. ${status} ${name}`;
  });
  if (members.length > visible.length) lines.push(`…и ещё ${members.length - visible.length}`);
  return [`👥 Участники Discord в сети: ${members.length}`, '', ...lines].join('\n').slice(0, 3900);
}
