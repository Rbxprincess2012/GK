// Эпик #4: индивидуальные права менеджера на разделы сайдбара.
//
// users.nav_permissions — массив разрешённых пунктов сайдбара (ключи-маршруты).
//   null  → ограничений нет: менеджер видит всё доступное по роли (как раньше).
//   []/[…] → видны только перечисленные пункты (пересечённые с roles в navConfig).
// Применяется только к роли manager; директор/суперпользователь видят всё.
//
// Идемпотентно (hasColumn).

export async function up(knex) {
  if (!(await knex.schema.hasColumn('users', 'nav_permissions'))) {
    // text[] nullable: null = без ограничений; '{}' = ничего не видно.
    // Консистентно с users.messengers (тоже text[]).
    await knex.schema.alterTable('users', (t) => t.specificType('nav_permissions', 'text[]'))
  }
}

export async function down(knex) {
  if (await knex.schema.hasColumn('users', 'nav_permissions')) {
    await knex.schema.alterTable('users', (t) => t.dropColumn('nav_permissions'))
  }
}
