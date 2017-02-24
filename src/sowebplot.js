'use strict';

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
        let v = this.func(...coords);
        if (v === Infinity || isNaN(v)) return undefined;
        return v;
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
            // We use central difference here, so -delta to +delta.
            p[k] = coords[k] - delta;
            let v1 = this.evalAt(...p);
            p[k] = coords[k] + delta;
            let v2 = this.evalAt(...p);
            grad[k] = (v2 - v1) / (2 * delta);
        }
        for (let gi of grad) {
            if (isNaN(gi))
                return undefined;
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
 * Abstract class. Provides the GL geometry and shader for drawing a certain object.
 */
class GraphicsObject {
    /**
     * (Re-)create the shader that will be used to render the object.
     * 
     * @param gl The WebGL context.
     * @returns true if a new shader was allocated.
     */
    buildShader(gl) {
        throw new Error("I'm not implemented.");
    }

    /**
     * (Re-)build the geometry that will be used to render the object.
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
     * Draw the object.
     * 
     * @param gl        The WebGL context.
     * @param camera    The camera object.
     * @param time      Time since last render.
     * @param bounds    Holds the min and max bounds, for example bounds.min[2] for minimum z.
     * @returns true if drawn, false otherwise.
     */
    draw(gl, time, camera, bounds) {
        throw new Error("I'm not implemented.");
    }

    /**
     * Clean up all cached information. Called before destruction.
     */
    cleanUp(gl) {

    }

    /**
     * Tells the renderer that this object is transparent, and needs sort priority.
     * @returns false
     */
     get transparent() { return false; }
}

class Axes3GraphicsObject extends GraphicsObject {
    constructor() {
        super();
        this._cubeProgram = null;
        this._lineProgram = null;
        this._cubeBuffers = null;
        this._lineBuffers = null;
    }

    buildShader(gl) {
        if (this._cubeProgram != null || this._lineProgram)
            return false;
        this._cubeProgram = twgl.createProgramInfo(
                gl, 
                [
                    // Vertex.
                    `
                    attribute vec3  position;
                    attribute vec3  normal;
                   
                    uniform mat4    view;
                    uniform mat4    model;
                    uniform mat4    proj;

                    varying vec3    vPosition;

                    void main() {
                        gl_Position = proj * view * model * vec4(position, 1);
                        vPosition = position;
                    }`
                    ,
                    // Fragment.
                    `
                    #extension GL_OES_standard_derivatives : enable
                    precision mediump float;
                    
                    uniform vec3 boundsMin;
                    uniform vec3 boundsMax;

                    varying vec3    vPosition;
                    
                    void main() { 
                        float fw = fwidth(vPosition.y);
                        float line = step(fw, mod(vPosition.y, 0.25));
                        gl_FragColor = vec4(vec3(1), 0.5*line);
                    }`
                ]);
        this._lineProgram = twgl.createProgramInfo(
                gl, 
                [
                    // Vertex.
                    `
                    attribute vec3  position;
                    attribute vec3  color;

                    uniform mat4    view;
                    uniform mat4    model;
                    uniform mat4    proj;

                    varying vec3    vColor;

                    void main() {
                        gl_Position = proj * view * model * vec4(position, 1);
                        vColor = color;
                    }`
                    ,
                    // Fragment.
                    `
                    precision mediump float;
                                        
                    varying vec3    vColor;
                    
                    void main() { 
                        gl_FragColor = vec4(vColor, 0.75);
                    }`
                ]);
        return true;
    }

    buildBuffers(gl, bounds, qualityOptions) {
        if (this._cubeBuffers != null && this._lineBuffers != null)
            return false;
        /*
            Create our cube, taking care that it is bounded from -0.5 to 0.5.
        */
        let cubeGeo = twgl.primitives.createCubeVertices(1);
        this._cubeBuffers = twgl.createBufferInfoFromArrays(gl, cubeGeo);
        /*
            Create the lines for our axes.
        */
        let lineGeo = {
            "indices":  { numComponents: 3, data: [0, 1,  0, 2,  0, 3]},
            "position": { numComponents: 3, data: [0, 0, 0,  0, 0.5, 0,   0.5, 0, 0,   0, 0, 0.5]},
            "color": { numComponents: 3, data: [1, 1, 1,  0, 1, 0,  1, 0, 0,  0, 0, 1]}
        };
        this._lineBuffers = twgl.createBufferInfoFromArrays(gl, lineGeo);

        return true;
    }

    draw(gl, time, camera, bounds) {
        if ((this._cubeProgram == null || this._lineProgram == null) || (this._cubeBuffers == null || this._lineBuffers == null))
            throw new ReferenceError("buildBuffers or buildShader not called prior to draw call.");
        
        let wx = Math.abs(bounds.max[0] - bounds.min[0]);
        let wy = Math.abs(bounds.max[1] - bounds.min[1]);
        let wz = Math.abs(bounds.max[2] - bounds.min[2]);

        let modelMat = twgl.m4.scaling([wx, wy, wz]);
        twgl.m4.translate(modelMat, [wx * 0.5 + bounds.min[0], wy * 0.5 + bounds.min[1], wz * 0.5 + bounds.min[2]], modelMat);
                
        function drawLines(me) {
            let uniforms = {
                view: camera.getViewMatrix(time),
                model: modelMat,
                proj: camera.getProjectionMatrix(time)
            };
            gl.useProgram(me._lineProgram.program);
            twgl.setBuffersAndAttributes(gl, me._lineProgram, me._lineBuffers);
            twgl.setUniforms(me._lineProgram, uniforms);        
            twgl.drawBufferInfo(gl, me._lineBuffers, gl.LINES);
        }

        function drawPlane(me) {
            let uniforms = {
                view: camera.getViewMatrix(time),
                model: modelMat,
                proj: camera.getProjectionMatrix(time),
                boundsMin: bounds.min,
                boundsMax: bounds.max
            };
            gl.useProgram(me._cubeProgram.program);
            gl.enable(gl.CULL_FACE);
            gl.frontFace(gl.CCW);
            gl.cullFace(gl.FRONT);
            twgl.setBuffersAndAttributes(gl, me._cubeProgram, me._cubeBuffers);        
            twgl.setUniforms(me._cubeProgram, uniforms);
            twgl.drawBufferInfo(gl, me._cubeBuffers);    
            gl.disable(gl.CULL_FACE);
            
        }
        drawPlane(this);
        drawLines(this);
    }

    get transparent() { return true; }
}

class R2toRGraphicsObject extends GraphicsObject {
    constructor(def) {
        super();
        if (!(def instanceof PlotDefinition)) 
            throw new TypeError("Expected object of type PlotDefinition.");
        this._def = def;
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
                    attribute vec3  position;
                    attribute vec3  normal;
                    attribute float value;
                   
                    uniform mat4    view;
                    uniform mat4    model;
                    uniform mat4    proj;

                    varying vec3    vWNormal;
                    varying vec3    vWPosition;
                    varying float   vValue;

                    void main() {
                        gl_Position = proj * view * model * vec4(position, 1);
                        vWNormal = normal; vWPosition = position; vValue = value;
                    }`
                    ,
                    // Fragment.
                    `
                    #extension GL_OES_standard_derivatives : enable
                    precision mediump float;
                    
                    const vec3 COLOUR_MIN = vec3(0.043, 0.475, 0.576);
                    const vec3 COLOUR_MAX = vec3(0.933, 0.486, 0.047);

                    uniform vec3 boundsMin;
                    uniform vec3 boundsMax;
                    uniform vec3 eye;
                                        
                    varying vec3    vWNormal;
                    varying vec3    vWPosition;
                    varying float   vValue;

                    vec3 color(float t) {
                        return vec3(
                            0.043 + 1.438 * t - 1.548 * t * t + t * t * t,
                            0.475 + 0.589 * t - 1.578 * t * t + t * t * t,
                            0.576 + 0.725 * t - 2.254 * t * t + t * t * t
                        );
                    }
                    
                    void main() { 
                        vec3 N = normalize(vWNormal); 
                        vec3 I = normalize(eye-vWPosition);
                        float ywidth = abs(boundsMax.y - boundsMin.y);
                        float yderiv = fwidth(vWPosition.y);
                        float ymod =  mod(vWPosition.y, 0.25);
                        if (vWPosition.y < boundsMin.y || vWPosition.y > boundsMax.y) discard; 
                        vec3 normalColor = (N * 0.5 + vec3(0.5)) * 0.3;
                        //vec3 valueColor  = pow(mix(0.1, 1.0, max(dot(I, -N), 0.0)), 0.3) * color(clamp(vValue, 0.0, 1.0)) * 0.7;
                        vec3 valueColor  = pow(mix(0.1, 1.0, max(dot(I, -N), 0.0)), 0.3) * mix(COLOUR_MIN, COLOUR_MAX, vValue) * 0.7;
                        gl_FragColor = vec4((normalColor + valueColor) * step(yderiv, ymod), 1);
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

        /*
            We create a grid of vertices here, and evaluate the function and 
            numerically approximate the gradient at each point.

            The function is evaluated according to common mathematical 
            conventions such that the XY plane is the "floor", and Z denotes 
            the height, that is z = f(x, y).

            For this reason we switch our z and y when we push the coordinates 
            to the position array, because common graphics convention is XZ as 
            the floor.

            We could evaluate the function as y = f(x, z) but I don't like to 
            mix "conceptual domains" unless I have to.

            The coordinates are in world space, so the grid will be at least 
            |bounds.max[0] - bounds.min[0]| wide in x and so forth.
        */

        // Todo: remove hard coding.
        const VERTICES_SQRT = 64;

        /*
            The difference between two vertices in x and y.
        */
        const X_STEP = Math.abs(bounds.max[0] - bounds.min[0]) / VERTICES_SQRT;
        const Y_STEP = Math.abs(bounds.max[1] - bounds.min[1]) / VERTICES_SQRT;

        /*
            An array that holds true or false for every generated vertex.

            isdefined[index] tells us whether a PREVIOUS vertex wasn't well 
            defined, that is, the function has a singularity or similar there.
        */
        let isdefined = [];

        /*
            We move along y then along x, building each vertex and face.
        */
        let previous_z = 0;
        for (let y = 0; y < VERTICES_SQRT; y++) {
            let pos_y = bounds.min[1] + Y_STEP * y;
            for (let x = 0; x < VERTICES_SQRT; x++) {
                let pos_x = bounds.min[0] + X_STEP * x;

                /*
                    Calculate the z value and the gradient at (x,y).
                */
                let pos_z = this._def.fn.evalAt(pos_x, pos_y);               
                let grad = this._def.fn.gradientAt(pos_x, pos_y);

                /*
                    Now we have to make sure vertices where our function isn't well
                    behaved gets some values. It will be sent to the GPU, but
                    polygons for it won't be generated. This wastes some memory,
                    hopefully we'll fix this in the future ;)
                */
                if (pos_z == undefined || grad == undefined)
                {
                    // The surrounding vertices will need to know this for 
                    // polygon creation.
                    isdefined.push(false);
                    geo.value.data.push(previous_z);
                    geo.position.data.push(...[pos_x, pos_z, 0]);
                    geo.normal.data.push(...[0, 1, 0]);
                    continue;
                } else {
                    previous_z = pos_z;
                    isdefined.push(true);
                    
                    geo.value.data.push(pos_z);

                    // Note we switch z and y here, to better accomodate for OpenGL conventions.
                    let P = [pos_x, pos_z, pos_y];
                    let N = [grad.at(0), -1, grad.at(1)];
                    let N_norm = 1.0/Math.sqrt(N[0]*N[0] + N[2]*N[2] + 1);
                    N[0] *= N_norm;
                    N[1] *= N_norm;
                    N[2] *= N_norm;                

                    geo.position.data.push(...P);
                    geo.normal.data.push(...N);
                }

                /*
                    For any vertex except the one at the starting corner, we have
                    a face to put in the array.
                */
                if (y != 0 && x != 0)
                {
                    let idx0 = ((y    ) * VERTICES_SQRT) + x;
                    let idx1 = ((y - 1) * VERTICES_SQRT) + x;
                    let idx2 = ((y - 1) * VERTICES_SQRT) + (x - 1);
                    let idx3 = ((y    ) * VERTICES_SQRT) + (x - 1);

                    /*
                        These are the cases for when one or all of the surrounding
                        vertices are for undefined function values.
                    */
                    let cases = [
                        !isdefined[idx1] &&  isdefined[idx2] &&  isdefined[idx3],
                         isdefined[idx1] && !isdefined[idx2] &&  isdefined[idx3],
                         isdefined[idx1] &&  isdefined[idx2] && !isdefined[idx3],
                        !isdefined[idx1] && !isdefined[idx2] && !isdefined[idx3]
                    ];

                    let idxs = [];
                    if (cases[0])
                        idxs = [idx0, idx3, idx2];
                    else if (cases[1])
                        idxs = [idx0, idx3, idx1];
                    else if (cases[2])
                        idxs = [idx0, idx2, idx1];
                    // All the surrounding vertices for undefined vertices, so we
                    // omit all polygons.
                    else if (cases[3])
                        continue;
                    // All the vertices are for defined values, so we can generate
                    // the triangles for the whole quad.
                    else
                        idxs = [idx0, idx2, idx1, idx0, idx3, idx2];
                    
                    geo.indices.data.push(...idxs);
                }
            }            
        }

        this._buffers = twgl.createBufferInfoFromArrays(gl, geo);
        return true;
    }

    draw(gl, time, camera, bounds) {
        if (this._program == null || this._buffers == null)
            throw new ReferenceError("buildBuffers or buildShader not called prior to draw call.");

        let uniforms = {
            view: camera.getViewMatrix(time),
            model: twgl.m4.identity(),
            proj: camera.getProjectionMatrix(time),
            eye: camera.position,
            boundsMin: bounds.min,
            boundsMax: bounds.max
        };
        gl.useProgram(this._program.program);
        twgl.setUniforms(this._program, uniforms);
        twgl.setBuffersAndAttributes(gl, this._program, this._buffers);
        twgl.drawBufferInfo(gl, this._buffers);
    }
}

/**
 * Implements a camera with ortographic projection.
 */
class OrthographicCamera {
    constructor() {
        this._viewMatrix = twgl.m4.identity();
        this._projMatrix = twgl.m4.ortho(-2, 2, -2, 2, 0.01, 100);
        this._invalidated = true;
        this._pos = twgl.v3.create(0, 0, 0);
        this._trg = twgl.v3.create(0, 0, -1);
    }

    setPosition(x, y, z) { 
        this._pos = twgl.v3.create(x, y, z); 
        this._invalidated = true;
        return this;
    }

    setTarget(x, y, z) { 
        this._trg = twgl.v3.create(x, y, z); 
        this._invalidated = true;
        return this;
    }

    get position() {
        return this._pos;
    }

    /**
     * Gets the camera's view matrix, transforms world space to camera space.
     * 
     * @param time The time passed since the last render.
     * @returns A twgl.m4 instance.
     */
    getViewMatrix(time) {
        if (this._invalidated = true) {
            let view = twgl.m4.lookAt(this._pos, this._trg, twgl.v3.create(0, 1, 0));
            this._viewMatrix = twgl.m4.inverse(view);
        }
        return this._viewMatrix;
    }

    /**
     * Gets the camera's projection matrix, transforms camera space to projection space.
     * 
     * @param time The time passed since the last render.
     * @returns A twgl.m4 instance.
     */
    getProjectionMatrix(time) {
        return this._projMatrix;
    }
}

class WebGLRenderer {
    constructor(gl) {
        if (!(gl instanceof WebGLRenderingContext))
            throw new TypeError("gl must be a WebGLRenderingContext");
        this._gl = gl;
        this._objects = [];
        this._objectsInvalidated = true;
    }

    registerGraphicsObject(gfx) {
        if (!(gfx instanceof GraphicsObject))
            throw new TypeError("Expected instance of GraphicsObject.");
        this._objects.push(gfx);
        this._objectsInvalidated = true;
    }

    unregisterGraphicsObject(def) {
        let idx = this._objects.findIndex((v, i, o) => v.def === def);
        if (idx === -1)
            throw new Error("Bug! unregister called for a GraphicsObject object not previously registered.");
        
        let res = this._objects[idx];

        if (res != null)
            res.cleanUp(this._gl);
        this._objects.splice(idx, 1);
    }

    reinitGraphics(gl, time, bounds) {
        for (let gfx of this._objects) {
            gfx.buildBuffers(gl, bounds, {});
            gfx.buildShader(gl);
        }
        this._objectsInvalidated = false;
    }

    init() {
        this._gl.getExtension("OES_standard_derivatives");
    }

    render(time, bounds, camera) {
        let gl = this._gl;

        if (this._objectsInvalidated) {
            this.reinitGraphics(gl, time, bounds);
            this._objectsInvalidated = false;
        }

        //gl.enable(gl.SAMPLE_COVERAGE);
        
        // Assume these things have been touched previously.
        gl.clearColor(0, 0, 0, 0);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.frontFace(gl.CCW);
        //gl.disable(gl.CULL_FACE);              
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        
        twgl.resizeCanvasToDisplaySize(gl.canvas);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        gl.clear(gl.DEPTH_BUFFER_BIT | gl.COLOR_BUFFER_BIT);

        for (let gfx of this._objects)
        {
            gfx.draw(gl, time, camera, bounds);
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
        if (this._parent == undefined)
            throw new Error("Couldn't locate the element.");
        
        this._canvas = document.createElement("canvas");
        if (this._canvas == null)
            throw new Error("Couldn't create canvas.");
        this._canvas.width = this._parent.clientWidth;
        this._canvas.height = this._parent.clientHeight;

        /*
            Now we create the webgl context, if it isn't around, we die.
        */
        this._glCtx = this._canvas.getContext("webgl", {depth: true, antialias:true, alpha:false});
        if (this._glCtx == null)
        {
            /*
                Try with experimental instead.
            */
            this._glCtx = this._canvas.getContext("experimental-webgl", {depth: true, antialias: true, alpha:false});
            if (this._glCtx == null)
                throw new Error("WebGL not supported.");
        }

        /*
            Add us last so we don't have to clean up if the prior checks fail.
        */
        this._parent.appendChild(this._canvas);

        this._renderer = new WebGLRenderer(this._glCtx);
        this._renderer.init();

        this._animationRequest = null;

        this._camera = new OrthographicCamera();
        //console.info("sowebplot|Supported extensions follows: " + this._glCtx.getSupportedExtensions().join("\n"));
    }

    /**
     * Starts the rendering loop.
     */
    loop() {
        if (this._animationRequest != null)
            return;
        
        let bounds = {
            "min": twgl.v3.create(-1.25, -1.25, -1.25),
            "max": twgl.v3.create( 1.25,  1.25,  1.25)
        };

        let me = this;
        function callRender(time) {
            me.renderer.render(time, bounds, me.camera);
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

    get camera() {
        return this._camera;
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