// PhysioAI · Version-2 — Login.

import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { t } from '../core/i18n.js';
import { login } from '../core/auth.js';
import { colors } from '../core/theme.js';
import Logo from '../components/Logo.js';

export default function LoginScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(''); setBusy(true);
    try {
      await login({ email, password });
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    } catch (e) {
      const key = e.code === 'required'
        ? 'errRequired'
        : (e.code === 'api_not_configured' || e.code === 'demo_disabled')
          ? 'errApiConfig'
          : e.code === 'invalid'
            ? 'errInvalid'
          : e.code === 'not_patient'
            ? 'errRole'
            : e.status
              ? 'errServer'
              : 'errInvalid';
      setError(t(key));
    } finally { setBusy(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable onPress={() => navigation.goBack()}><Text style={styles.back}>‹ {t('back')}</Text></Pressable>
        <View style={styles.brand}><Logo size={72} /></View>
        <Text style={styles.title}>{t('login')}</Text>

        <View style={styles.form}>
          <Text style={styles.label}>{t('email')}</Text>
          <TextInput style={styles.input} value={email} onChangeText={setEmail}
            autoCapitalize="none" keyboardType="email-address" autoCorrect={false}
            placeholder="you@email.com" placeholderTextColor={colors.ink3} />

          <Text style={styles.label}>{t('password')}</Text>
          <TextInput style={styles.input} value={password} onChangeText={setPassword}
            secureTextEntry placeholder="••••••••" placeholderTextColor={colors.ink3} />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.btn, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.inverse} /> : <Text style={styles.btnTxt}>{t('login')}</Text>}
          </Pressable>
        </View>

        <View style={{ flex: 1 }} />
        <Pressable style={styles.switch} onPress={() => navigation.replace('Register')}>
          <Text style={styles.switchTxt}>{t('noAccount')} <Text style={styles.link}>{t('signUpLink')}</Text></Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, padding: 24 },
  back: { color: colors.ink2, fontSize: 15, marginBottom: 8 },
  brand: { alignItems: 'center', marginTop: 18, marginBottom: 10 },
  title: { fontSize: 28, fontWeight: '700', color: colors.ink, marginTop: 8, marginBottom: 22, textAlign: 'center' },
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
