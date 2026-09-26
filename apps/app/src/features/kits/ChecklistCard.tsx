import type { MessageView } from '@caishy/core/api';
import {
  applyChecklistOp,
  type ChecklistOp,
  checklistItems,
  checklistState,
} from '@caishy/core/kit-cards';
import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';
import { endpoints } from '@/api/endpoints';
import { upsertMessage } from '@/state/cache';
import { useMe } from '@/state/session';
import { useTheme } from '@/theme/theme';
import { Chip } from '@/ui/Chip';
import { IconButton } from '@/ui/IconButton';
import { ListChecks, Square, SquareCheck, X } from '@/ui/icons';
import { Pressable } from '@/ui/Pressable';
import { Text } from '@/ui/Text';
import { TextField } from '@/ui/TextField';
import { toast } from '@/ui/Toast';

interface ChecklistPayload {
  label?: string;
  title?: string;
  state?: string;
  fields?: Record<string, unknown>;
}

/**
 * A shared checklist (PRD §41): anyone in the conversation ticks and adds; whoever added an item,
 * or made the list, can take it off. A change shows at once, by the same rule the server applies
 * (core kit-cards.ts), and the server's card replaces it when it answers.
 */
export function ChecklistCard({ m, mine }: { m: MessageView; mine: boolean }) {
  const t = useTheme();
  const qc = useQueryClient();
  const me = useMe();
  const [adding, setAdding] = useState('');
  const p = (m.payload ?? {}) as ChecklistPayload;
  const items = checklistItems(p.fields ?? {});
  const done = items.filter((i) => i.done).length;
  const open = !m.deletedAt;

  const change = async (op: ChecklistOp) => {
    const local = applyChecklistOp(items, op, { userId: me.id, isCreator: mine });
    if (!local.ok) return toast(local.error, { tone: 'danger' });
    upsertMessage(qc, {
      ...m,
      payload: {
        ...p,
        fields: { ...p.fields, items: local.items },
        state: checklistState(local.items),
      },
    });
    try {
      upsertMessage(qc, (await endpoints.checklist(m.id, op)).message);
    } catch (e) {
      upsertMessage(qc, m);
      toast((e as Error).message, { tone: 'danger' });
    }
  };

  const add = () => {
    const text = adding.trim();
    if (!text) return;
    setAdding('');
    void change({ op: 'add', text });
  };

  return (
    <View style={{ gap: 8, minWidth: 220, maxWidth: 340 }} testID="kit-checklist">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ListChecks size={16} color={t.c.accentStrong} />
        <Text variant="overline" color="textSecondary" style={{ flex: 1 }}>
          {p.label ?? 'Checklist'}
        </Text>
        <Chip
          label={items.length && done === items.length ? 'Done' : `${done} of ${items.length}`}
          tone={items.length && done === items.length ? 'success' : 'neutral'}
          size="sm"
        />
      </View>
      <Text variant="bodyStrong">{p.title}</Text>
      <View accessibilityRole="list">
        {items.map((item) => {
          const Box = item.done ? SquareCheck : Square;
          const removable = open && (mine || item.addedBy === me.id);
          return (
            <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: item.done, disabled: !open }}
                accessibilityLabel={item.text}
                disabled={!open}
                onPress={() => void change({ op: 'toggle', itemId: item.id, done: !item.done })}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 6,
                  minHeight: 36,
                }}
                testID={`checklist-item-${item.text}`}
              >
                <Box size={20} color={item.done ? t.c.success : t.c.textTertiary} />
                <Text
                  variant="body"
                  color={item.done ? 'textTertiary' : 'text'}
                  style={item.done ? { textDecorationLine: 'line-through', flex: 1 } : { flex: 1 }}
                  auto
                >
                  {item.text}
                </Text>
              </Pressable>
              {removable ? (
                <IconButton
                  icon={X}
                  size={28}
                  label={`Take “${item.text}” off the list`}
                  onPress={() => void change({ op: 'remove', itemId: item.id })}
                />
              ) : null}
            </View>
          );
        })}
      </View>
      {open ? (
        <TextField
          value={adding}
          onChangeText={setAdding}
          placeholder="Add an item"
          accessibilityLabel={`Add to ${p.title ?? 'the list'}`}
          returnKeyType="done"
          blurOnSubmit={false}
          onSubmitEditing={add}
          testID="checklist-add"
        />
      ) : null}
    </View>
  );
}
