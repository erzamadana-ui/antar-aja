import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, ActivityIndicator, StyleSheet, ViewStyle, TextStyle, TextInputProps, StyleProp,
  Platform, ScrollView, Animated, KeyboardAvoidingView, Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors, radius, shadow, spacing, font } from '@/lib/theme';
import { initials } from '@/lib/format';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export const Icon = Ionicons;

// ---------- Button ----------
interface ButtonProps {
  title: string; onPress?: () => void | Promise<void>; variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  loading?: boolean; disabled?: boolean; icon?: IconName; style?: ViewStyle; size?: 'md' | 'sm' | 'lg'; color?: string;
}
export function Button({ title, onPress, variant = 'primary', loading, disabled, icon, style, size = 'md', color }: ButtonProps) {
  const [busy, setBusy] = useState(false);
  const isLoading = loading || busy;
  const bg = variant === 'primary' ? color ?? colors.primary : variant === 'danger' ? colors.danger : variant === 'secondary' ? colors.primaryLight : 'transparent';
  const fg = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'secondary' ? colors.primaryDark : color ?? colors.primary;
  const height = size === 'lg' ? 54 : size === 'sm' ? 38 : 48;
  const handle = async () => {
    if (!onPress || isLoading || disabled) return;
    try { setBusy(true); await onPress(); } finally { setBusy(false); }
  };
  return (
    <Pressable onPress={handle} disabled={disabled || isLoading}
      style={({ pressed }) => [s.btn, { backgroundColor: bg, height, opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        borderWidth: variant === 'outline' ? 1.5 : 0, borderColor: color ?? colors.primary }, style]}>
      {isLoading ? <ActivityIndicator color={fg} /> : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon && <Ionicons name={icon} size={size === 'sm' ? 16 : 20} color={fg} />}
          <Text style={{ color: fg, fontWeight: '700', fontSize: size === 'sm' ? 14 : 16 }}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

// ---------- Input ----------
interface InputProps extends TextInputProps {
  label?: string; error?: string | null; icon?: IconName; right?: React.ReactNode; containerStyle?: ViewStyle;
}
export function Input({ label, error, icon, right, containerStyle, style, ...rest }: InputProps) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={[{ gap: 6 }, containerStyle]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <View style={[s.inputWrap, focus && { borderColor: colors.primary }, error ? { borderColor: colors.danger } : null]}>
        {icon && <Ionicons name={icon} size={18} color={colors.textMuted} style={{ marginRight: 8 }} />}
        <TextInput placeholderTextColor={colors.textMuted} onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          style={[s.input, style]} {...rest} />
        {right}
      </View>
      {error ? <Text style={{ color: colors.danger, fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}

// ---------- Card ----------
export function Card({ children, style, onPress, padded = true }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; padded?: boolean }) {
  const content = <View style={[s.card, padded && { padding: spacing.lg }, style]}>{children}</View>;
  if (!onPress) return content;
  return <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.9 : 1 })}>{content}</Pressable>;
}

// ---------- Screen (header + safe area) ----------
interface ScreenProps {
  title?: string; children: React.ReactNode; scroll?: boolean; back?: boolean; right?: React.ReactNode; padded?: boolean;
  bg?: string; headerBg?: string; headerFg?: string; footer?: React.ReactNode; contentStyle?: ViewStyle; keyboard?: boolean; maxWidth?: number;
}
export function Screen({ title, children, scroll = true, back, right, padded = true, bg = colors.bg, headerBg = colors.surface, headerFg = colors.text, footer, contentStyle, keyboard = true, maxWidth = 720 }: ScreenProps) {
  const router = useRouter();
  const insets = useSafeAreaInsetsSafe();
  const inner = { width: '100%' as const, maxWidth, alignSelf: 'center' as const };
  const body = scroll ? (
    <ScrollView contentContainerStyle={[padded && { padding: spacing.lg }, { paddingBottom: 40 }, inner, contentStyle]} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded && { padding: spacing.lg }, inner, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: headerBg }} edges={['top']}>
      <View style={{ flex: 1, backgroundColor: bg }}>
        {(title || back || right) && (
          <View style={[s.header, { backgroundColor: headerBg }]}>
            <View style={[s.headerInner, inner]}>
              {back ? (
                <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} hitSlop={12} style={s.backBtn}>
                  <Ionicons name="arrow-back" size={22} color={headerFg} />
                </Pressable>
              ) : <View style={{ width: 8 }} />}
              <Text style={[font.h3, { flex: 1, color: headerFg, fontSize: 17 }]} numberOfLines={1}>{title}</Text>
              {right}
            </View>
          </View>
        )}
        {keyboard && Platform.OS === 'ios' ? (
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>{body}</KeyboardAvoidingView>
        ) : body}
        {footer && <View style={[s.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}><View style={inner}>{footer}</View></View>}
      </View>
    </SafeAreaView>
  );
}
function useSafeAreaInsetsSafe() { try { return useSafeAreaInsets(); } catch { return { bottom: 0, top: 0, left: 0, right: 0 }; } }

// ---------- Small pieces ----------
export function Row({ children, style, gap = 8, between }: { children: React.ReactNode; style?: ViewStyle; gap?: number; between?: boolean }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, between && { justifyContent: 'space-between' }, style]}>{children}</View>;
}
export function Divider({ style }: { style?: ViewStyle }) { return <View style={[{ height: 1, backgroundColor: colors.border, marginVertical: spacing.md }, style]} />; }
export function Badge({ text, color = colors.primary, bg, style }: { text: string; color?: string; bg?: string; style?: ViewStyle }) {
  return (
    <View style={[{ backgroundColor: bg ?? color + '1A', paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, alignSelf: 'flex-start' }, style]}>
      <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}
export function Avatar({ name, url, size = 44 }: { name?: string | null; url?: string | null; size?: number }) {
  if (url) return <Image source={{ uri: url }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.border }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.primaryDark, fontWeight: '800', fontSize: size * 0.38 }}>{initials(name)}</Text>
    </View>
  );
}
export function IconCircle({ name, color = colors.primary, size = 44, bg }: { name: IconName; color?: string; size?: number; bg?: string }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg ?? color + '1A', alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.5} color={color} />
    </View>
  );
}
export function Loading({ text }: { text?: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <ActivityIndicator size="large" color={colors.primary} />
      {text ? <Text style={font.small}>{text}</Text> : null}
    </View>
  );
}
export function Empty({ icon = 'file-tray-outline', title, subtitle, action }: { icon?: IconName; title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <IconCircle name={icon} size={72} color={colors.textMuted} bg={colors.border} />
      <Text style={[font.h3, { marginTop: 8 }]}>{title}</Text>
      {subtitle ? <Text style={[font.small, { textAlign: 'center' }]}>{subtitle}</Text> : null}
      {action ? <View style={{ marginTop: 12 }}>{action}</View> : null}
    </View>
  );
}
export function ListItem({ icon, iconColor = colors.primary, title, subtitle, right, onPress, danger }: { icon?: IconName; iconColor?: string; title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.listItem, pressed && { backgroundColor: colors.bg }]}>
      {icon && <IconCircle name={icon} color={danger ? colors.danger : iconColor} size={38} />}
      <View style={{ flex: 1 }}>
        <Text style={[font.body, { fontWeight: '600' }, danger && { color: colors.danger }]}>{title}</Text>
        {subtitle ? <Text style={font.small}>{subtitle}</Text> : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={colors.textMuted} /> : null)}
    </Pressable>
  );
}
export function Stars({ value, size = 14, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  return (
    <Row gap={2}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} onPress={onChange ? () => onChange(i) : undefined} disabled={!onChange} hitSlop={4}>
          <Ionicons name={i <= Math.round(value) ? 'star' : 'star-outline'} size={size} color={colors.accent} />
        </Pressable>
      ))}
    </Row>
  );
}
export function Chip({ label, active, onPress, color = colors.primary }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && { backgroundColor: color, borderColor: color }]}>
      <Text style={{ color: active ? '#fff' : colors.text, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}
export function SectionTitle({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row between style={{ marginBottom: 10, marginTop: 4 }}>
      <Text style={font.h3}>{title}</Text>
      {action ? <Pressable onPress={onAction}><Text style={{ color: colors.primary, fontWeight: '700' }}>{action}</Text></Pressable> : null}
    </Row>
  );
}
export function Stepper({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
  const btn = (name: IconName, fn: () => void, disabled: boolean) => (
    <Pressable onPress={fn} disabled={disabled} hitSlop={6} style={[s.stepBtn, disabled && { opacity: 0.4 }]}>
      <Ionicons name={name} size={16} color={colors.primary} />
    </Pressable>
  );
  return (
    <Row gap={10}>
      {btn('remove', () => onChange(value - 1), value <= min)}
      <Text style={{ fontWeight: '700', minWidth: 20, textAlign: 'center' }}>{value}</Text>
      {btn('add', () => onChange(value + 1), value >= max)}
    </Row>
  );
}

// ---------- Toast sederhana (global) ----------
type ToastMsg = { id: number; text: string; type: 'info' | 'error' | 'success' };
let pushToast: ((t: ToastMsg) => void) | null = null;
export const toast = {
  show: (text: string, type: ToastMsg['type'] = 'info') => pushToast?.({ id: Date.now(), text, type }),
  error: (text: string) => pushToast?.({ id: Date.now(), text, type: 'error' }),
  success: (text: string) => pushToast?.({ id: Date.now(), text, type: 'success' }),
};
export function ToastHost() {
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pushToast = (t) => {
      setMsg(t);
      Animated.timing(anim, { toValue: 1, duration: 180, useNativeDriver: true }).start();
      setTimeout(() => Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => setMsg(null)), 3200);
    };
    return () => { pushToast = null; };
  }, [anim]);
  if (!msg) return null;
  const bg = msg.type === 'error' ? colors.danger : msg.type === 'success' ? colors.success : colors.text;
  return (
    <Animated.View pointerEvents="none" style={[s.toast, { backgroundColor: bg, opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) }] }]}>
      <Text style={{ color: '#fff', fontWeight: '600', textAlign: 'center' }}>{msg.text}</Text>
    </Animated.View>
  );
}

// ---------- Bottom sheet sederhana ----------
export function Sheet({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const insets = useSafeAreaInsetsSafe();
  return (
    <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 16) }, style]}>
      <View style={s.handle} />
      {children}
    </View>
  );
}

export function Money({ value, style }: { value: number; style?: TextStyle }) {
  return <Text style={[{ fontWeight: '800', color: colors.text }, style]}>{'Rp' + Math.round(value).toLocaleString('id-ID')}</Text>;
}

const s = StyleSheet.create({
  btn: { borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface, paddingHorizontal: 12, minHeight: 48 },
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 10, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : {}) },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.card },
  header: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  headerInner: { flexDirection: 'row', alignItems: 'center', height: 52, paddingHorizontal: 8, gap: 4 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  footer: { backgroundColor: colors.surface, paddingHorizontal: spacing.lg, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  stepBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', bottom: 90, left: 20, right: 20, maxWidth: 520, alignSelf: 'center', width: '100%', padding: 14, borderRadius: radius.md, zIndex: 1000, ...shadow.card },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, ...shadow.sheet },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginBottom: 12, marginTop: -6 },
});
