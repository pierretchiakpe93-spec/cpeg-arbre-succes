import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';

const APK_URL = 'https://pierretchiakpe93-spec.github.io/cpeg-arbre-succes/gestion/application.apk';

window.openLatestApk = async (event) => {
  event?.preventDefault();
  const url = `${APK_URL}?update=${Date.now()}`;

  try {
    if (Capacitor.isNativePlatform()) {
      await Browser.open({ url });
      return;
    }
  } catch (error) {
    console.warn('Ouverture du navigateur de mise à jour impossible :', error);
  }

  window.location.assign(url);
};
