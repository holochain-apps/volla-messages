<script lang="ts">
  import { MIN_FIRST_NAME_LENGTH, MIN_TITLE_LENGTH } from "$config";
  import ButtonIcon from "$lib/ButtonIcon.svelte";
  import { t } from "$translations";

  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher<{
    save: { firstName: string; lastName: string };
    cancel: null;
  }>();

  export let initialFirstName: string;
  export let initialLastName: string;

  let firstName: string = initialFirstName;
  let lastName: string = initialLastName;

  $: isFirstNameValid = firstName.trim().length >= MIN_FIRST_NAME_LENGTH;
</script>

<div class="flex flex-row flex-wrap items-center justify-center">
  <input
    autofocus
    class="bg-surface-900 max-w-40 border-none p-0 pl-0.5 text-start text-3xl outline-none focus:outline-none focus:ring-0"
    type="text"
    placeholder={$t("common.first") + " *"}
    name="firstName"
    bind:value={firstName}
    minlength={MIN_FIRST_NAME_LENGTH}
    on:keydown={(event) => {
      if (event.key === "Escape") dispatch("cancel");
    }}
  />
  <input
    class="bg-surface-900 max-w-40 border-none p-0 text-start text-3xl outline-none focus:outline-none focus:ring-0"
    type="text"
    placeholder={$t("common.last")}
    name="lastName"
    bind:value={lastName}
    on:keydown={(event) => {
      if (event.key === "Enter") dispatch("save", { firstName, lastName });
      if (event.key === "Escape") dispatch("cancel");
    }}
  />
  <div class="flex flex-none items-center justify-center">
    <ButtonIcon
      moreClasses="h-6 w-6 rounded-md !p-1 mb-0 mr-2 bg-primary-100 flex items-center justify-center"
      on:click={() => dispatch("save", { firstName, lastName })}
      icon="checkMark"
      disabled={!isFirstNameValid}
    />
    <ButtonIcon
      moreClasses="h-6 w-6 !p-1 mb-0 rounded-md bg-surface-400 flex items-center justify-center"
      on:click={() => dispatch("cancel")}
      icon="x"
      iconColor="gray"
    />
  </div>
</div>
