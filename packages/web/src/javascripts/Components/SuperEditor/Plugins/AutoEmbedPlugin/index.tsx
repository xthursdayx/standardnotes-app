/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

import type { LexicalEditor } from 'lexical'

import {
  AutoEmbedOption,
  EmbedConfig,
  EmbedMatchResult,
  LexicalAutoEmbedPlugin,
  URL_MATCHER,
} from '@lexical/react/LexicalAutoEmbedPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { useState } from 'react'
import * as ReactDOM from 'react-dom'

import useModal from '../../Lexical/Hooks/useModal'
import Button from '../../Lexical/UI/Button'
import { DialogActions } from '../../Lexical/UI/Dialog'
import { INSERT_TWEET_COMMAND } from '../TwitterPlugin'
import { INSERT_YOUTUBE_COMMAND } from '../YouTubePlugin'
import { classNames } from '@standardnotes/snjs'

interface PlaygroundEmbedConfig extends EmbedConfig {
  // Human readable name of the embeded content e.g. Tweet or Google Map.
  contentName: string

  // Icon for display.
  icon?: JSX.Element
  iconName: string

  // An example of a matching url https://twitter.com/jack/status/20
  exampleUrl: string

  // For extra searching.
  keywords: Array<string>

  // Embed a Figma Project.
  description?: string
}

export const YoutubeEmbedConfig: PlaygroundEmbedConfig = {
  contentName: 'Youtube Video',

  exampleUrl: 'https://www.youtube.com/watch?v=jNQXAC9IVRw',

  // Icon for display.
  icon: <i className="icon youtube" />,
  iconName: 'youtube',

  insertNode: (editor: LexicalEditor, result: EmbedMatchResult) => {
    editor.dispatchCommand(INSERT_YOUTUBE_COMMAND, result.id)
  },

  keywords: ['youtube', 'video'],

  // Determine if a given URL is a match and return url data.
  parseUrl: (url: string) => {
    const match = /^.*(youtu\.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/.exec(url)

    const id = match ? (match?.[2].length === 11 ? match[2] : null) : null

    if (id != null) {
      return {
        id,
        url,
      }
    }

    return null
  },

  type: 'youtube-video',
}

export const TwitterEmbedConfig: PlaygroundEmbedConfig = {
  // e.g. Tweet or Google Map.
  contentName: 'Tweet',

  exampleUrl: 'https://twitter.com/jack/status/20',

  // Icon for display.
  icon: <i className="icon tweet" />,
  iconName: 'tweet',

  // Create the Lexical embed node from the url data.
  insertNode: (editor: LexicalEditor, result: EmbedMatchResult) => {
    editor.dispatchCommand(INSERT_TWEET_COMMAND, result.id)
  },

  // For extra searching.
  keywords: ['tweet', 'twitter'],

  // Determine if a given URL is a match and return url data.
  parseUrl: (text: string) => {
    const match = /^https:\/\/twitter\.com\/(#!\/)?(\w+)\/status(es)*\/(\d+)$/.exec(text)

    if (match != null) {
      return {
        id: match[4],
        url: match[0],
      }
    }

    return null
  },

  type: 'tweet',
}

export const EmbedConfigs = [TwitterEmbedConfig, YoutubeEmbedConfig]

function AutoEmbedMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  index: number
  isSelected: boolean
  onClick: () => void
  onMouseEnter: () => void
  option: AutoEmbedOption
}) {
  return (
    <li
      key={option.key}
      tabIndex={-1}
      className={classNames('cursor-pointer rounded px-2 py-1', isSelected && 'bg-info-backdrop')}
      ref={option.setRefElement}
      role="option"
      aria-selected={isSelected}
      id={'typeahead-item-' + index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <span className="text">{option.title}</span>
    </li>
  )
}

function AutoEmbedMenu({
  options,
  selectedItemIndex,
  onOptionClick,
  onOptionMouseEnter,
}: {
  selectedItemIndex: number | null
  onOptionClick: (option: AutoEmbedOption, index: number) => void
  onOptionMouseEnter: (index: number) => void
  options: Array<AutoEmbedOption>
}) {
  return (
    <div className="typeahead-popover min-w-max rounded border border-border bg-default p-1">
      <ul className="list-none">
        {options.map((option: AutoEmbedOption, i: number) => (
          <AutoEmbedMenuItem
            index={i}
            isSelected={selectedItemIndex === i}
            onClick={() => onOptionClick(option, i)}
            onMouseEnter={() => onOptionMouseEnter(i)}
            key={option.key}
            option={option}
          />
        ))}
      </ul>
    </div>
  )
}

export function AutoEmbedDialog({
  embedConfig,
  onClose,
}: {
  embedConfig: PlaygroundEmbedConfig
  onClose: () => void
}): JSX.Element {
  const [text, setText] = useState('')
  const [editor] = useLexicalComposerContext()

  const urlMatch = URL_MATCHER.exec(text)
  const embedResult = text != null && urlMatch != null ? embedConfig.parseUrl(text) : null

  const onClick = async () => {
    const result = await embedResult
    if (result != null) {
      embedConfig.insertNode(editor, result)
      onClose()
    }
  }

  return (
    <div className="w-[600px] max-w-[90vw]">
      <div className="Input__wrapper">
        <input
          type="text"
          className="Input__input"
          placeholder={embedConfig.exampleUrl}
          value={text}
          data-test-id={`${embedConfig.type}-embed-modal-url`}
          onChange={(e) => {
            setText(e.target.value)
          }}
        />
      </div>
      <DialogActions>
        <Button disabled={!embedResult} onClick={onClick} data-test-id={`${embedConfig.type}-embed-modal-submit-btn`}>
          Embed
        </Button>
      </DialogActions>
    </div>
  )
}

export default function AutoEmbedPlugin(): JSX.Element {
  const [modal, showModal] = useModal()

  const openEmbedModal = (embedConfig: PlaygroundEmbedConfig) => {
    showModal(`Embed ${embedConfig.contentName}`, (onClose) => (
      <AutoEmbedDialog embedConfig={embedConfig} onClose={onClose} />
    ))
  }

  const getMenuOptions = (activeEmbedConfig: PlaygroundEmbedConfig, embedFn: () => void, dismissFn: () => void) => {
    return [
      new AutoEmbedOption('Dismiss', {
        onSelect: dismissFn,
      }),
      new AutoEmbedOption(`Embed ${activeEmbedConfig.contentName}`, {
        onSelect: embedFn,
      }),
    ]
  }

  return (
    <>
      {modal}
      <LexicalAutoEmbedPlugin<PlaygroundEmbedConfig>
        embedConfigs={EmbedConfigs}
        onOpenEmbedModalForConfig={openEmbedModal}
        getMenuOptions={getMenuOptions}
        menuRenderFn={(anchorElementRef, { selectedIndex, options, selectOptionAndCleanUp, setHighlightedIndex }) => {
          return anchorElementRef.current
            ? ReactDOM.createPortal(
                <div
                  className="typeahead-popover auto-embed-menu"
                  style={{
                    marginLeft: anchorElementRef.current.style.width,
                  }}
                >
                  <AutoEmbedMenu
                    options={options}
                    selectedItemIndex={selectedIndex}
                    onOptionClick={(option: AutoEmbedOption, index: number) => {
                      setHighlightedIndex(index)
                      selectOptionAndCleanUp(option)
                    }}
                    onOptionMouseEnter={(index: number) => {
                      setHighlightedIndex(index)
                    }}
                  />
                </div>,
                anchorElementRef.current,
              )
            : null
        }}
      />
    </>
  )
}