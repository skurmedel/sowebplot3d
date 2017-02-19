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
    onUpdate(fn, ctx) {
        this._updateCallback = (t) => { fn(t, ctx); };
    }

    /**
     * Calls any callback set with onUpdate, generally meant for subclass use.
     * @returns true if anything was called, false otherwise.
     */
    notifyUpdate() {
        if (this._updateCallback != null) {
            this._updateCallback(this);
            return true;
        }
        return false;
    }

    /**
     * Calculate the plotted surface inside the bounds.
     * 
     * The returned geometry consists of quads.
     * 
     * Returns an object:
     * 
     *  {
     *      "indices": { numComponents: 3, data: [0, 1, 2, 2, 3, 1] },
     *      "position": { numComponents: 3, data: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3] },
     *      "normal": { numComponents: 3, data: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0] },
     *      "value": { numComponents: 1, data: [0.3, 0.4, 0.5, 0.6]}
     *  }
     * 
     * where indices is a list of integer into position and normal.
     * 
     * The coordinate system assumes x and y are the cardinal axes for the "floor"
     * plane, and z is "up", contrary to the usual graphics programming convention
     * with "y" up. This uses the common convention in analysis.
     */
    calculateSurface(bounds, qualityOptions) { }
};

class R2toRPlot extends PlotDefinition {
    constructor(realValuedFunc) {
        if (!(realValuedFunc instanceof RealValuedFunction))
            throw new TypeError("Expected a RealValuedFunction.");
        super();
        this._func = realValuedFunc;
    }

    calculateSurface(bounds, qualityOptions) {
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
                let pos_z = this._func.evalAt(pos_x, pos_y);
                
                geo.value.data.push(pos_z);

                let grad = this._func.gradientAt(pos_x, pos_y);
                let N = [grad.at(0), grad.at(1), -1];
                let N_norm = 1.0/Math.sqrt(N[0]*N[0] + N[1]*N[1] + 1);
                N[0] *= N_norm;
                N[1] *= N_norm;
                N[2] *= N_norm;
            
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

        return geo;
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

        //console.info("sowebplot|Supported extensions follows: " + this._glCtx.getSupportedExtensions().join("\n"));
    }

    get canvas() {
        return this._canvas;
    }

    get webgl() {
        return this._glCtx;
    }
}