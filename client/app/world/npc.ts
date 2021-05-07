//Imports
  import { Render } from "../render/render.ts"
  import { Renderable } from "./renderable.ts"
  import { CHUNK_SIZE, TILE_SIZE, CREATURES_FLYING, CREATURES_SWIMMING } from "../render/settings.ts"
  import type { World } from "./world.ts"
  import type { Area } from "./area.ts"
  import { App } from "./../app.ts"

/** Patterns */
  const enum Pattern {
    patrol = "patrol",
    loop = "loop",
    wander = "wander",
    fixed = "fixed",
    lookaround = "lookaround",
  }

/** Types */
  export const enum Type {
    people = "people",
    creatures = "creatures",
  }

/** Read-write */
//deno-lint-ignore no-explicit-any
  type rw = any

/**
 * NPC
 */
  export class NPC extends Renderable {

    /** Sprite */
      readonly sprite:ReturnType<typeof Render.Container>

    /** Sprites */
      readonly sprites:{
        main:ReturnType<typeof Render.Sprite>
        mask:ReturnType<typeof Render.Graphics>|null
        shadow:ReturnType<typeof Render.Graphics>|null
      }

    /** Offset */
      readonly offset = {x:0, y:0}

    /** Area */
      readonly area:Area

    /** Track */
      private readonly track = [] as number[]

    /** Track index */
      private _track_index = 0

    /** Track pattern */
      readonly pattern = "wander" as Pattern

    /** Name */
      readonly name:string

    /** Frame */
      readonly frame:string

    /** Type */
      readonly type:Type

    /** Life time */
      private lifetime = Infinity

    /** Constructor */
      constructor({world, area, type, name}:{world:World, area:Area, type:Type, name:string}) {
        super({world})
        this.area = area
        this.name = name
        this.type = type
        this.sprite = Render.Container()
        this.frame = ""
        if (type === Type.creatures) {
          const type = Math.random() < App.config.shinyRate ? "shiny" : "regular"
          this.frame = `${type}/${this.name}`
          this.lifetime = Math.floor(12+Math.random()*28)
        }
        if (type === Type.people)
          this.frame = `${this.frame}_down_0`
        this.sprites = {
          main:this.sprite.addChild(Render.Sprite({frame:this.frame, anchor:[0.5, 1]})),
          mask:null,
          shadow:null
        }
        if (App.debug.logs)
          console.debug(`loaded npc: ${this.frame}`)
        this.computeSpawn()
        this.computePattern()
      }

    /** Destructor */
      destructor() {
        if (App.debug.logs)
          console.debug(`unloaded npc: ${this.frame}`)
        this.area.npcs.delete(this)
        return super.destructor()
      }

    /** Compute spawn point */
      private computeSpawn() {
        //Search initial spawn point
        this.x = this.area.polygon.points[0]/TILE_SIZE
        this.y = this.area.polygon.points[1]/TILE_SIZE
        for (const {dx, dy} of [{dx:-1, dy:-1}, {dx:0, dy:-1}, {dx:+1, dy:-1}, {dx:-1, dy:0}, {dx:+1, dy:0}, {dx:-1, dy:+1}, {dx:0, dy:+1}, {dx:+1, dy:+1}]) {
          this.x += dx
          this.y += dy
          if (this.area.contains(this))
            break
        }
        //Random spawn point within polygon
        let nx = this.x, ny = this.y
        for (let i = 0; i < 30*Math.random(); i++)
        for (const {dx, dy} of [{dx:0, dy:-1}, {dx:-1, dy:0}, {dx:+1, dy:0}, {dx:0, dy:+1}]) {
          if (this.area.contains({x:nx+dx, y:ny+dy})) {
            nx += dx
            ny += dy
          }
        }
        this.x = nx
        this.y = ny
      }

    /** Compute pattern */
      private computePattern() {
        if ((this.pattern === "loop")||(this.pattern === "patrol")) {
          //Compute track
            const points = this.area.polygon.points.map((n:number) => n/TILE_SIZE) as number[]
            points.push(points[0], points[1])
            ;(this as rw).track = [points[0], points[1]]
            for (let i = 2; i < points.length; i+=2) {
              const [px, py, nx, ny] = [points[i-2], points[i-1], points[i], points[i+1]]
              const dx = nx - px
              const dy = ny - py
              let [x, y] = [px, py]
              for (let j = 0; j < Math.abs(dx); j++)
                this.track.push(x+=Math.sign(dx), y)
              for (let j = 0; j < Math.abs(dy); j++)
                this.track.push(x, y+=Math.sign(dy))
            }
          //Push reversed track on patrol
            if (this.pattern === "patrol") {
              const points = this.track.slice()
              for (let i = points.length-4; i > 0; i-=2)
                this.track.push(points[i], points[i+1])
            }
          //Remove duplicated cell on loop
            if ((this.pattern === "loop")&&(this.track[0] === this.track[this.track.length-2])&&(this.track[1] === this.track[this.track.length-1])) {
              this.track.pop()
              this.track.pop()
            }
        }
      }

    /** Render */
      render() {
        const chunk = this.world.chunkAt(this)
        if (chunk) {
          //Flying creatures' shadow
          if ((CREATURES_FLYING.includes(this.name))&&(!this.sprites.shadow)) {
            this.offset.y = -TILE_SIZE
            const shadow = Render.Graphics({fill:[0, 0.5], ellipse:[0, 0, 2/3, 2/4]})
            this.sprites.shadow = this.sprite.addChildAt(shadow, 0)
          }
          //Swimming creatures' masks
          if ((CREATURES_SWIMMING.includes(this.name)&&(!this.sprites.mask))) {
            const mask = Render.Graphics({rect:[-2, -1.75, 4, 1], fill:[0, 0]})
            this.sprite.addChild(mask)
            this.sprites.main.mask = this.sprites.mask = mask
          }
          //Placement
          const rx = this.x-chunk.x, ry = this.y-chunk.y
          this.sprite.position.set((rx+0.5)*TILE_SIZE, (ry+1)*TILE_SIZE)
          this.sprite.zIndex = ry*CHUNK_SIZE
          this.sprites.main.position.set(this.offset.x, this.offset.y)
          chunk?.layers.get("2X")?.addChild(this.sprite)
        }
      }

    /** Update */
      update(tick:number) {
        if (Number.isInteger(tick)) {
          this[this.pattern]()
          this.render()
          if (this.lifetime-- < 0)
            this.destructor()
        }
      }

    /** Fixed */
      private fixed() {}

    /** Loop (follow track and loop over) */
      private loop() {
        this._track_index = (this._track_index+2)%this.track.length
        this.x = this.track[this._track_index]
        this.y = this.track[this._track_index+1]
      }

    /** Patrol (follow track and reverse) */
      private patrol() {
        this.loop()
      }

    /** Wander */
      private wander() {
        ([() => this.goLeft(), () => this.goRight(), () => this.goUp(), () => this.goDown()][Math.floor(Math.random()/0.25)])()
      }

    /** Lookaround */
      private lookaround() {
        ([() => this.lookLeft(), () => this.lookRight(), () => this.lookUp(), () => this.lookDown()][Math.floor(Math.random()/0.25)])()
      }

    /** Texture */
      private texture(suffix?:string, {flip = 0}:{flip?:number} = {}) {
        const frame = `${this.frame}${suffix ? `_${suffix}` : ""}`
        if (frame in Render.cache)
          this.sprites.main.texture = Render.Texture({frame})
        if (flip)
          this.sprites.main.scale.x = Math.sign(flip)
      }

    /** Look left */
      private lookLeft() {
        this.texture("left_0", {flip:+1})
      }

    /** Go left */
      private goLeft() {
        if (this.area.contains({x:this.x-1, y:this.y})) {
          this.x--
          this.lookLeft()
        }
      }

    /** Look right */
      private lookRight() {
        this.texture("right_0", {flip:-1})
      }

    /** Go right */
      private goRight() {
        if (this.area.contains({x:this.x+1, y:this.y})) {
          this.x++
          this.lookRight()
        }
      }

    /** Look up */
      private lookUp() {
        this.texture("up_0")
      }

    /** Go up */
      private goUp() {
        if (this.area.contains({x:this.x, y:this.y-1})) {
          this.y--
          this.lookUp()
        }
      }

    /** Look down */
      private lookDown() {
        this.texture("down_0")
      }

    /** Go down */
      private goDown() {
        if (this.area.contains({x:this.x, y:this.y+1})) {
          this.y++
          this.lookDown()
        }
      }

  }
