// PhysioAI · Version-2 — Register.

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../core/i18n.js';
import { register } from '../core/auth.js';
import { colors } from '../core/theme.js';

export default function RegisterScreen({ navigation }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError('');
    if (!name || !email || !password) { setError(t('errRequired')); return; }
    if (password !== confirm) { setError(t('errMatch')); return; }
    setBusy(true);
    try {
      await register({ name, email, password });
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (e) {
      const key = e.code === 'exists'
        ? 'errExists'
        : e.code === 'required'
          ? 'errRequired'
          : (e.code === 'api_not_configured' || e.code === 'demo_disabled')
            ? 'errApiConfig'
            : 'errServer';
      setError(t(key));
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ {t('back')}</Text></Pressable>
          <Text style={styles.title}>{t('register')}</Text>

          <View style={styles.form}>
            <Text style={styles.label}>{t('fullName')}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="…" placeholderTextColor={colors.ink3} />

            <Text style={styles.label}>{t('email')}</Text>
            <TextInput style={styles.input} value={email} onChangeText={setEmail}
              autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
              placeholder="you@email.com" placeholderTextColor={colors.ink3} />

            <Text style={styles.label}>{t('password')}</Text>
            <TextInput style={styles.input} value={password} onChangeText={setPassword}
              secureTextEntry placeholder="••••••••" placeholderTextColor={colors.ink3} />

            <Text style={styles.label}>{t('confirmPassword')}</Text>
            <TextInput style={styles.input} value={confirm} onChangeText={setConfirm}
              secureTextEntry placeholder="••••••••" placeholderTextColor={colors.ink3} />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.inverse} /> : <Text style={styles.btnTxt}>{t('register')}</Text>}
            </Pressable>
          </View>

          <View style={{ flex: 1 }} />
          <Pressable style={styles.switch} onPress={() => navigation.replace('Login')}>
            <Text style={styles.switchTxt}>{t('haveAccount')} <Text style={styles.link}>{t('loginLink')}</Text></Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: 24 },
  back: { color: colors.ink2, fontSize: 15, marginBottom: 8 },
  title: { fontSize: 28, fontWeight: '700', color: colors.ink, marginTop: 8, marginBottom: 18 },
  form: { gap: 8 },
  label: { fontSize: 13, color: colors.ink2, fontWeight: '600', marginTop: 8 },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14, fontSize: 16, color: colors.ink },
  error: { color: colors.bad, fontSize: 14, marginTop: 10 },
  btn: { backgroundColor: colors.brand, borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 18 },
  btnTxt: { color: colors.inverse, fontWeight: '700', fontSize: 17 },
  switch: { alignItems: 'center', paddingVertical: 14 },
  switchTxt: { color: colors.ink2, fontSize: 15 },
  link: { color: colors.brand, fontWeight: '700' },
});
