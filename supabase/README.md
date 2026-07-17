# Discord, carnet synchronisé et administration de Plumetopia

Le catalogue public fonctionne avec la base locale sans backend. Une fois Supabase et Discord configurés, chaque joueur peut retrouver son carnet sur ses appareils. Seul l'identifiant Discord placé dans la liste blanche voit le bouton **ADMIN**.

## Mise en route

1. Créer un projet Supabase et exécuter `schema.sql` dans l'éditeur SQL.
2. Créer une application dans le portail développeur Discord.
3. Dans **Supabase > Authentication > Sign In / Providers > Discord**, copier l'URL de callback Supabase. Elle ressemble à `https://PROJET.supabase.co/auth/v1/callback`.
4. Ajouter cette callback dans **Discord > OAuth2 > Redirects**, puis copier le Client ID et le Client Secret Discord dans le fournisseur Discord de Supabase.
5. Dans **Supabase > Authentication > URL Configuration** :

   - définir l'URL publique finale comme `Site URL` ;
   - ajouter le domaine final à la liste des redirections autorisées ;
   - pendant le développement, autoriser aussi `http://localhost:8000/**`.

6. Activer le mode développeur dans Discord, copier votre identifiant utilisateur numérique puis exécuter :

   ```sql
   insert into public.admin_discord_users (discord_user_id)
   values ('VOTRE_ID_DISCORD');
   ```

   Utiliser le **snowflake numérique**, jamais le pseudo ou le nom d'affichage.

7. Dans `site-config.js`, renseigner uniquement l'URL HTTPS du projet et la clé publique `sb_publishable_…`.
8. Se connecter avec Discord. Le compte autorisé voit apparaître le bouton flottant **ADMIN**. À la première ouverture, l'interface impose l'activation TOTP avant toute écriture.

Le Client Secret Discord, une clé `service_role`, une clé `sb_secret_…`, un mot de passe ou un jeton utilisateur ne doivent jamais être placés dans les fichiers du site.

## Garanties mises en place

- OAuth Discord pour tous les joueurs, sans mot de passe géré par Plumetopia.
- Carnet stocké dans `user_bird_observations`, isolé par utilisateur avec RLS et `auth.uid()`.
- Identification administrateur à partir de `auth.identities.provider_id`, donnée du fournisseur protégée côté Supabase.
- Aucune autorisation fondée sur `user_metadata`, modifiable par l'utilisateur.
- Bouton ADMIN purement ergonomique ; les véritables contrôles restent en base.
- Écriture administrateur réservée à l'identifiant Discord autorisé **et** à une session `aal2` après TOTP.
- Coordonnées séparées et sans lecture publique.
- Validation en base, version optimiste, horodatage, audit et sauvegarde transactionnelle.
- Synchronisation Realtime du catalogue après chaque modification.

La session Discord est persistée par Supabase dans le navigateur pour retrouver le carnet. Il faut donc appliquer les en-têtes de `security-headers.example.txt`, conserver une politique CSP stricte et éviter toute injection HTML.

## Avant la production

- Retirer les URL locales de la liste de redirection Supabase.
- Activer CAPTCHA et des limites de débit adaptées.
- Tester qu'un utilisateur normal ne peut lire que son carnet et ne peut modifier aucune fiche.
- Tester qu'un administrateur sans TOTP voit le bouton mais reçoit un refus d'écriture.
- Sauvegarder la base et contrôler régulièrement `bird_audit_log`.
- Pour une administration multi-utilisateur ou critique, préférer à terme un BFF avec cookie `HttpOnly; Secure; SameSite=Strict`.

Aucun système ne peut être honnêtement garanti « sans faille ». Cette architecture place cependant l'identité, l'isolation des carnets et les permissions d'édition côté base, et non dans un simple bouton caché.
