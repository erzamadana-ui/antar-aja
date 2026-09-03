import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen, Row, Chip, toast } from '@/components/ui';
import { useOrderChat, useOrder } from '@/hooks/useOrder';
import { useAuth } from '@/store/auth';
import { colors, font, radius } from '@/lib/theme';
import { formatTime } from '@/lib/format';

const QUICK = ['Saya sudah di lokasi', 'Tunggu sebentar ya', 'Posisi di mana?', 'Terima kasih 🙏'];

export default function OrderChat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const uid = useAuth((s) => s.session?.user.id);
  const { messages, send } = useOrderChat(id);
  const { order, driver, customer } = useOrder(id);
  const [text, setText] = useState('');
  const scroll = useRef<ScrollView>(null);
  const isCustomer = order?.customer_id === uid;
  const other = isCustomer ? driver?.profile?.full_name : customer?.full_name;
  const closed = order ? ['completed', 'cancelled', 'searching'].includes(order.status) : false;

  useEffect(() => { setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); }, [messages.length]);

  const submit = async (t: string) => {
    if (!uid || !t.trim()) return;
    try { await send(uid, t); setText(''); } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Screen title={other ? `Chat · ${other}` : 'Chat'} back scroll={false} padded={false} keyboard={false}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }} keyboardVerticalOffset={60}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 8 }}>
          <Text style={[font.tiny, { textAlign: 'center', marginBottom: 8 }]}>Chat hanya tersedia selama pesanan berlangsung. Jaga sopan santun ya.</Text>
          {messages.map((m) => {
            const mine = m.sender_id === uid;
            return (
              <View key={m.id} style={[s.bubble, mine ? s.mine : s.theirs]}>
                <Text style={{ color: mine ? '#fff' : colors.text }}>{m.body}</Text>
                <Text style={{ fontSize: 10, color: mine ? 'rgba(255,255,255,0.75)' : colors.textMuted, marginTop: 2, alignSelf: 'flex-end' }}>{formatTime(m.created_at)}</Text>
              </View>
            );
          })}
        </ScrollView>
        {!closed && (
          <View style={s.composer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
              {QUICK.map((q) => <Chip key={q} label={q} onPress={() => submit(q)} />)}
            </ScrollView>
            <Row gap={8}>
              <TextInput value={text} onChangeText={setText} placeholder="Tulis pesan…" placeholderTextColor={colors.textMuted} style={s.input} onSubmitEditing={() => submit(text)} />
              <Pressable onPress={() => submit(text)} style={s.send}><Ionicons name="send" size={18} color="#fff" /></Pressable>
            </Row>
          </View>
        )}
        {closed && <Text style={[font.small, { textAlign: 'center', padding: 16 }]}>Chat ditutup.</Text>}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const s = StyleSheet.create({
  bubble: { maxWidth: '80%', padding: 10, borderRadius: radius.lg },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderBottomLeftRadius: 4 },
  composer: { padding: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.full, paddingHorizontal: 16, height: 44, color: colors.text },
  send: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
