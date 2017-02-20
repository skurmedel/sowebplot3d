/**
 * Represents a vector in R^n. 
 */
class RealVector {
    /**
     * Constructs a new vector whose dimension is dictated by the amount of input
     * elements. All elements needs to be float convertible.
     */
    constructor(...values) {
        this._values = Array.from(values, (v, k) => parseFloat(v));
               
        this._dims = this._values.length;

        if (this.dims < 1)
            throw new RangeError("Empty vectors are not allowed.");
      
        for (var num of this._values) {
            if (isNaN(num))
                throw new TypeError("Non float-convertible value given.");
        }
    };

    /**
     * Gets element k in the vector. Throws if k is out of range.
     */
    at(k) {
        return this._values[k];
    }

    get dims() {
        return this._dims;
    }

    toString() {
        return "(" + this._values.join(", ") + ")"
    }
};

/**
 * Represents a function f: R^n -> R.
 */
class RealValuedFunction {
    /**
     * Creates a new instance of RealValuedFunction, with expr as its definition.
     * @arg {Array} vars An array of strings, each representing a variable in expr
     * @arg {String} expr A javascript code segment.
     */
    constructor(vars, expr) {
        this.vars = vars;
        for (let v of vars) {
            if (!(typeof v === "string")) {
                throw new TypeError("vars needs to be an array of strings.");
            }
        }
        
        this.func = new Function(...this.vars, "return (" + expr + ");");

        /*
            Will throw if the names in vars doesn't correspond to expr.
        */
        this.evalAt(1, 1);
    }

    static get defaultEpsilon() {
        return Number.EPSILON * 64;
    }

    /**
     * Evaluate the function at the given coordinates.
     */
    evalAt(...coords) {
        return this.func(...coords);
    }

    /**
     * Numerically calculates the gradient at the given coordinates.
     * 
     * Returns a vector consisting of the numerical partial derivatives of our 
     * function along each standard axis in R^n.
     */
    gradientAt(...coords) {
        if (coords.length != this.vars.length)
            throw new RangeError(`This is a function from R^${this.vars.length}, called as a function from R^${coords.length}.`);
        let delta = RealValuedFunction.defaultEpsilon;
        let grad = [];
        const origin = new Array(this.vars.length).fill(0, 0, this.vars.length);
        for (let k = 0; k < origin.length; k++) {
            let p = new Array(...origin);
            p[k] = coords[k];
            let v1 = this.evalAt(...p);
            p[k] += delta;
            let v2 = this.evalAt(...p);
            grad[k] = (v2 - v1) / delta;
        }
        return new RealVector(...grad);
    }
};

/**
 * Abstract class. Defines a function and its plot.
 */
class PlotDefinition {
    constructor() {
        this._updateCallback = null;
    }

    /**
     * Sets a callback that will be called with this object and ctx as arguments,
     * whenever a meaningful property of the plot changes.
     */
    setOnUpdate(fn, ctx) {
        this._updateCallback = (t) => { fn(t, ctx); };
    }

    /**
     * Calls any callback set with setOnUpdate, generally meant for subclass use.
     * @returns true if anything was called, false otherwise.
     */
    notifyUpdate() {
        if (this._updateCallback != null) {
            this._updateCallback(this);
            return true;
        }
        return false;
    }
};

class R2toRPlot extends PlotDefinition {
    constructor(realValuedFunc) {
        if (!(realValuedFunc instanceof RealValuedFunction))
            throw new TypeError("Expected a RealValuedFunction.");
        super();
        this._func = realValuedFunc;
    }

    get fn() { return this._func; }
}

/**
 * Abstract class. Provides the GL geometry and shader for drawing a certain plot.
 */
class PlotGraphics {
    /**
     * Creates a new PlotGraphics object.
     * @throws TypeError def was not a PlotDefinition object.
     */
    constructor(def) {
        if (!(def instanceof PlotDefinition))
            throw new ReferenceError("def is not a PlotDefinition.");
        this._def = def;
    }

    get def() { return this._def; }

    /**
     * Called when the associated definition is updated. Can be overriden to check when stuff
     * needs to be invalidated.
     */
    defWasUpdated(fn, ctx) {

    }

    /**
     * (Re-)create the shader that will be used to render the plot.
     * 
     * @param gl The WebGL context.
     * @returns true if a new shader was allocated.
     */
    buildShader(gl) {
        throw new Error("I'm not implemented.");
    }

    /**
     * (Re-)build the geometry that will be used to render the plot.
     * 
     * Must be called before any call to buildBuffers.
     * 
     * @param gl The WebGL context.
     * @returns true if new buffers were allocated.
     */
    buildBuffers(gl, bounds, qualityOptions) {
        throw new Error("I'm not implemented.");
    }

    /**
     * Bind the buffers created in buildBuffers.
     * 
     * If buildBuffers was not called, this should throw an error!
     * 
     * @param gl The WebGL context.
     */
    bindBuffers(gl) {
        throw new Error("I'm not implemented.");
    }

    /**
     * Binds the shader created in buildShader.
     * 
     * If buildShader was not called, this should throw an error!
     * 
     * @param gl The WebGL context.
     */
    bindShader(gl) {
        throw new Error("I'm not implemented.");
    }

    /**
     * Set the uniforms needed by the shader.
     * 
     * @param gl        The WebGL context.
     * @param viewMat   view transform matrix.
     * @param projMat   projection transform matrix.
     * @param time      Time since last render.
     * @param bounds    Holds the min and max bounds, for example bounds.min[2] for minimum z.
     */
    setUniforms(gl, time, viewMat, projMat, bounds) {
        throw new Error("I'm not implemented.");
    }

    /**
     * Called last, should draw the buffers.
     * 
     * @returns true if drawn, false otherwise.
     */
    drawBuffers(gl) {
        throw new Error("I'm not implemented.");
    }

    /**
     * Clean up all cached information. Called before destruction.
     */
    cleanUp(gl) {

    }
}

class R2toRPlotGraphics extends PlotGraphics {
    constructor(def) {
        super(def);
        this._program = null;
        this._buffers = null;
    }

    buildShader(gl) {
        if (this._program != null)
            return false;
        this._program = twgl.createProgramInfo(
                gl, 
                [
                    // Vertex.
                    `
                    attribute vec3 position;
                    attribute vec3 normal;
                    attribute float value;
                    varying vec3 vNormal;
                    varying vec3 vPosition;
                    varying float vValue;
                    varying vec3 vEye;
                    uniform mat4 view;
                    uniform mat4 model;
                    uniform mat4 proj;
                    void main() {
                        vEye = (view * model * vec4(0, 0, -1, 1)).xyz;
                        gl_Position = proj * view * model * vec4(position, 1);
                        vNormal = normal; vPosition = position; vValue = value;
                    }`
                    ,
                    // Fragment.
                    `
                    #extension GL_OES_standard_derivatives : enable
                    precision mediump float;
                    varying vec3 vPosition;
                    varying vec3 vNormal;
                    varying float vValue;
                    varying vec3 vEye;
                    uniform vec3 boundsMin;
                    uniform vec3 boundsMax;
                    const vec3 COLOUR_MIN = vec3(0.043, 0.475, 0.576);
                    const vec3 COLOUR_MAX = vec3(0.933, 0.486, 0.047);
                    void main() { 
                        vec3 N = normalize(vNormal); vec3 I = normalize(vEye);
                        float ywidth = abs(boundsMax.y - boundsMin.y);
                        float yderiv = fwidth(vPosition.y);
                        float ymod =  mod(vPosition.y, 0.25);
                        if (vPosition.y < boundsMin.y || vPosition.y > boundsMax.y) discard; 
                        gl_FragColor = vec4(mix(0.2, 1.0, abs(dot(N, I))) * mix(COLOUR_MIN, COLOUR_MAX, vValue) * step(yderiv, ymod), 1);
                    }`
                ]);
        return true;
    }

    buildBuffers(gl, bounds, qualityOptions) {
        if (this._buffers != null)
            return false;
        
        let geo = 
        { 
            "indices":  { numComponents: 3, data: [] },
            "position": { numComponents: 3, data: [] },
            "normal":   { numComponents: 3, data: [] },
            "value":    { numComponents: 1, data: [] }
        };

        const VERTICES_SQRT = 64;
        const X_STEP = Math.abs(bounds.max[0] - bounds.min[0]) / VERTICES_SQRT;
        const Y_STEP = Math.abs(bounds.max[1] - bounds.min[1]) / VERTICES_SQRT;

        for (let y = 0; y < VERTICES_SQRT; y++) {
            let pos_y = bounds.min[1] + Y_STEP * y;
            for (let x = 0; x < VERTICES_SQRT; x++) {
                let pos_x = bounds.min[0] + X_STEP * x;
                let pos_z = this.def.fn.evalAt(pos_x, pos_y);
                
                geo.value.data.push(pos_z);

                let grad = this.def.fn.gradientAt(pos_x, pos_y);
                let N = [grad.at(0), grad.at(1), -1];
                let N_norm = 1.0/Math.sqrt(N[0]*N[0] + N[1]*N[1] + 1);
                N[0] *= N_norm;
                N[1] *= N_norm;
                N[2] *= N_norm;
            
                // Note we switch z and y here, to better accomodate for OpenGL conventions.
                let P = [pos_x, pos_z, pos_y];

                geo.position.data.push(...P);
                geo.normal.data.push(...N);

                // Insert faces.
                if (y != 0 && x != 0)
                {
                    let idx0 = ((y    ) * VERTICES_SQRT) + x;
                    let idx1 = ((y - 1) * VERTICES_SQRT) + x;
                    let idx2 = ((y - 1) * VERTICES_SQRT) + (x - 1);
                    let idx3 = ((y    ) * VERTICES_SQRT) + (x - 1);
                    geo.indices.data.push(...[idx3, idx2, idx1, idx1, idx0, idx3])
                }
            }            
        }

        this._buffers = twgl.createBufferInfoFromArrays(gl, geo);
        return true;
    }

    bindBuffers(gl) {
        if (this._buffers == null)
            throw new ReferenceError("bindBuffers called before buildBuffers.");
        twgl.setBuffersAndAttributes(gl, this._program, this._buffers);
    }

    bindShader(gl) {
        if (this._program == null)
            throw new ReferenceError("bindShader called before buildShader.");
        gl.useProgram(this._program.program);
    }

    setUniforms(gl, time, viewMat, projMat, bounds) {
        if (this._program == null)
            throw new ReferenceError("setUniforms called before buildShader.");
        let uniforms = {
            view: viewMat,
            model: twgl.m4.identity(),
            proj: projMat,
            boundsMin: bounds.min,
            boundsMax: bounds.max
        };
        twgl.setUniforms(this._program, uniforms);
    }

    drawBuffers(gl) {
        if (this._program == null || this._buffers == null)
            throw new ReferenceError("buildBuffers or buildShader not called prior to draw call.");
        twgl.drawBufferInfo(gl, this._buffers);
    }
}

class WebGLRenderer {
    constructor(gl) {
        if (!(gl instanceof WebGLRenderingContext))
            throw new TypeError("gl must be a WebGLRenderingContext");
        this._gl = gl;
        this._plotGraphics = [];
        this._plotGraphicsInvalidated = true;
    }

    registerPlotGraphics(gfx) {
        if (!(gfx instanceof PlotGraphics))
            throw new TypeError("Expected instance of PlotGraphics.");
        this._plotGraphics.push(gfx);
    }

    unregisterPlotGraphics(def) {
        let idx = this._plotGraphics.findIndex((v, i, o) => v.def === def);
        if (idx === -1)
            throw new Error("Bug! unregister called for a PlotGraphics object not previously registered.");
        
        let res = this._plotGraphics[idx];

        if (res != null)
            res.cleanUp(this._gl);
        this._plotGraphics.splice(idx, 1);
    }

    reinitGraphics(gl, time, bounds) {
        for (let gfx of this._plotGraphics) {
            gfx.buildBuffers(gl, bounds, {});
            gfx.buildShader(gl);
        }
    }

    init() {
        this._gl.getExtension("OES_standard_derivatives");
    }

    render(time, bounds) {
        let gl = this._gl;

        if (this._plotGraphicsInvalidated) {
            this.reinitGraphics(gl, time, bounds);
            this._plotGraphicsInvalidated = false;
        }        

        // Assume these things have been touched previously.
        gl.clearColor(0, 0, 0, 1);
        gl.frontFace(gl.CCW);
        //gl.disable(gl.CULL_FACE);              
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);

        twgl.resizeCanvasToDisplaySize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

        function calculateProjMat() {
            let projMat = twgl.m4.ortho(-2, 2, -2, 2, 0.01, 100);
            return projMat;
        }

        function calculateViewMat() {
            let pos = twgl.v3.create(1, 1, 1);
            let move = twgl.m4.lookAt(pos, twgl.v3.create(0, 0, 0), twgl.v3.create(0, 1, 0));
            return twgl.m4.inverse(move);
            //return twgl.m4.identity();
        }

        for (let gfx of this._plotGraphics)
        {
            gfx.bindShader(gl);
            gfx.bindBuffers(gl);
            gfx.setUniforms(gl, time, calculateViewMat(), calculateProjMat(), bounds);
            gfx.drawBuffers(gl);
        }
    }

    deinit() {

    }
}

class SoWebPlotter{
    constructor(elementId) {
        /*
            Install canvas and get webgl context.
        */
        this._parent = document.getElementById(elementId);
        if (this._parent == undefined || this._parent == null)
            throw new Error("Couldn't locate the element.");
        
        this._canvas = document.createElement("canvas");
        this._canvas.width = this._parent.clientWidth;
        this._canvas.height = this._parent.clientHeight;

        /*
            Now we create the webgl context, if it isn't around, we die.
        */
        this._glCtx = this._canvas.getContext("webgl", {stencil:true});
        if (this._glCtx == null || this._glCtx == undefined)
            throw new Error("WebGL not supported.");

        /*
            Add us last so we don't have to clean up if the prior checks fail.
        */
        this._parent.appendChild(this._canvas);

        this._renderer = new WebGLRenderer(this._glCtx);
        this._renderer.init();


        this._animationRequest = null;
        //console.info("sowebplot|Supported extensions follows: " + this._glCtx.getSupportedExtensions().join("\n"));
    }

    /**
     * Starts the rendering loop.
     */
    loop() {
        if (this._animationRequest != null)
            return;
        
        let bounds = {
            "min": twgl.v3.create(-1.5, -1.5, -1.5),
            "max": twgl.v3.create( 1.5,  1.5,  1.5)
        };

        let me = this;
        function callRender(time) {
            me.renderer.render(time, bounds);
            me._animationRequest = requestAnimationFrame(callRender);
        }
        requestAnimationFrame(callRender);
    }

    /**
     * Stops the rendering loop. Does nothing if loop hasn't been called previously.
     */
    stopLoop() {
        if (this._animationRequest != null) {
            window.cancelAnimationFrame(this._animationRequest);
        }
        this._animationRequest = null;
    }

    get renderer() {
        return this._renderer;
    }

    get canvas() {
        return this._canvas;
    }

    get webgl() {
        return this._glCtx;
    }
}