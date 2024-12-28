<script lang="ts">
  import { MIN_TITLE_LENGTH } from "$config";
  import ButtonIcon from "$lib/ButtonIcon.svelte";
  import { t } from "$translations";

  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher<{ save: string; cancel: null }>();

  export let initialValue: string;

  let value: string = initialValue;
</script>

<div class="flex flex-row flex-wrap items-center justify-center">
  <input
    autofocus
    class="bg-surface-900 grow border-none pl-0.5 pt-0 text-center text-3xl outline-none focus:outline-none focus:ring-0"
    type="text"
    placeholder={$t("conversations.enter_name_here")}
    name="title"
    bind:value
    minlength={MIN_TITLE_LENGTH}
    on:keydown={(event) => {
      if (event.key === "Enter") dispatch("save", value);
      if (event.key === "Escape") dispatch("cancel");
    }}
  />
  <div class="flex flex-none items-center justify-center">
    <ButtonIcon
      moreClasses="h-6 w-6 rounded-md !p-1 mb-0 mr-2 bg-primary-100 flex items-center justify-center"
      on:click={() => dispatch("save", value)}
      icon="checkMark"
    />
    <ButtonIcon
      moreClasses="h-6 w-6 !p-1 mb-0 rounded-md bg-surface-400 flex items-center justify-center"
      on:click={() => dispatch("cancel")}
      icon="x"
      iconColor="gray"
    />
  </div>
</div>
