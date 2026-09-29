# Connexion sécurisée de l’application scolaire

Cette version de `index.html` utilise Supabase Auth, la base PostgreSQL et des politiques RLS. Elle ne charge aucune donnée de démonstration et n’utilise pas `localStorage` pour les dossiers scolaires.

## 1. Installer la base

Dans le projet Supabase `njfnbbrrdwekpsmsevzx`, ouvrez **SQL Editor**, collez le contenu de `setup.sql`, puis exécutez-le. Le script crée les tables, le stockage privé des images et les règles d’accès par école, rôle, classe et élève. Il peut être rejoué pour remettre à jour les politiques.

## 2. Créer le compte administrateur initial

Dans Supabase, ouvrez **Authentication → Users → Add user** et créez le compte de l’administrateur. Après la création, récupérez son UUID dans la liste des utilisateurs. Exécutez ensuite cette requête SQL en remplaçant l’UUID et le nom :

```sql
insert into public.profiles (user_id, school_id, full_name, role)
values (
  'UUID_DE_L_UTILISATEUR',
  '00000000-0000-4000-8000-000000000001',
  'Administrateur',
  'admin'
);
```

L’application ne comporte pas de formulaire d’inscription libre. L’administrateur crée les autres comptes dans **Authentication → Users**, puis leurs profils dans `public.profiles` avec l’un des rôles `parent`, `enseignant`, `censeur` ou `surveillant`. Les associations parent-enfant se font dans `public.student_links`; les classes d’un enseignant dans `public.teacher_classes`. Ces associations sont nécessaires pour appliquer le périmètre des droits.

Dans **Authentication → Settings**, désactivez l’inscription publique si elle est activée. Seuls les profils ayant une ligne active dans `public.profiles` peuvent lire les données scolaires.

## 3. Configurer le client web

Dans `config.js`, remplacez `REMPLACER_PAR_LA_CLE_PUBLISHABLE_SUPABASE` par la clé **Publishable** visible dans **Project Settings → API Keys**. Cette clé est conçue pour être utilisée dans un navigateur; les règles RLS sont la protection réelle. N’utilisez jamais une clé `secret` ou `service_role` dans `config.js`, le HTML ou GitHub.

## 4. Publier l’application

Copiez `index.html` et `config.js` dans le dossier `gestion/` du dépôt GitHub, et `setup.sql` dans `supabase/setup.sql`. Dans Vercel, importez le dépôt, gardez le dossier racine comme racine du projet et déployez. L’application sera disponible à l’adresse Vercel suivie de `/gestion/`.

Avant d’utiliser les vrais dossiers, créez un compte parent, un enseignant et un surveillant de test, associez-les uniquement aux élèves/classes concernés, puis vérifiez que chaque compte ne voit que son périmètre.

